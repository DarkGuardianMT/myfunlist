<?php

declare(strict_types=1);

namespace {
    require dirname(__DIR__) . '/vendor/autoload.php';
    require __DIR__ . '/support/open_library_pdo.php';
}

namespace MyFunList\Infrastructure {
    // De bootstrap gebruikt uitsluitend de pilot-SQL-dubbel.
    final class Database
    {
        public static int $calls = 0;
        public function connect(): \PDO
        {
            self::$calls++;
            return $GLOBALS['db'];
        }
        public function check(): void { $this->connect(); }
    }
}

namespace MyFunList\Provider {
    // Alle provider-I/O blijft lokaal, ook bij tests via de echte bootstrap.
    final class CurlProviderHttpClient implements ProviderHttpClient
    {
        public static int $calls = 0;
        public static bool $fail = false;
        public function get(string $url, array $headers = []): array
        {
            self::$calls++;
            if (self::$fail) throw new ProviderException(503, 'provider_unavailable', 'fixture-private');
            return json_decode(file_get_contents(__DIR__ . '/fixtures/open_library.json'), true, 512, JSON_THROW_ON_ERROR);
        }
    }
}

namespace {
    use MyFunList\Http\Application;
    use MyFunList\Http\Controllers\OpenLibraryController;
    use MyFunList\Http\JsonResponse;
    use MyFunList\Http\Router;
    use MyFunList\Infrastructure\Database;
    use MyFunList\Provider\CurlProviderHttpClient as Http;
    use MyFunList\Provider\OpenLibraryPilot;
    use MyFunList\RateLimit\OpenLibraryClientLimiter as Limiter;

    $checks = 0;
    function verifyAdmission(bool $condition, string $message): void
    {
        global $checks;
        $checks++;
        if (!$condition) throw new RuntimeException($message);
    }
    function seedAdmission(OpenLibraryTestPDO $db, array $clients = []): void { $db->reset($clients); }
    function admissionState(OpenLibraryTestPDO $db): array { return $db->state(); }
    function admissionApp(OpenLibraryPilot $pilot): Application
    {
        $controller = new OpenLibraryController($pilot);
        $router = new Router();
        $router->add('GET', '/api/v1/pilot/open-library/search', static fn (): JsonResponse => $controller->search($_GET));
        return new Application($router);
    }
    function admissionRequest(Application $app, array $query = ['q' => 'Hobbit']): JsonResponse
    {
        $_GET = $query;
        return $app->handle('GET', '/api/v1/pilot/open-library/search');
    }
    function admissionHeaders(JsonResponse $response): array
    {
        return (new ReflectionProperty(JsonResponse::class, 'headers'))->getValue($response);
    }

    $originalEnvironment = $_ENV;
    $originalServer = $_SERVER;
    $originalGet = $_GET;
    $db = new OpenLibraryTestPDO();
    $store = new \MyFunList\Provider\OpenLibraryStateStore(static fn (): PDO => $db);
    $secret = str_repeat('fixture-', 8);
    $now = 1000.0;
    $clock = static function () use (&$now): float { return $now; };
    $db->clock = $clock;
    $http = new Http();
    $pilot = new OpenLibraryPilot($http, true, true, $store, 'MyFunList (fixture@example.test)', $secret);
    $app = admissionApp($pilot);
    $_SERVER['REMOTE_ADDR'] = '192.0.2.10';
    $_SERVER['DOCUMENT_ROOT'] = '';

    try {
        $disabled = admissionApp(new OpenLibraryPilot($http, false, false, $store, 'invalid', ''));
        $filesBefore = Database::$calls;
        $callsBefore = Http::$calls;
        unset($_SERVER['REMOTE_ADDR']);
        $response = admissionRequest($disabled, []);
        verifyAdmission($response->status === 404 && json_decode($response->body(), true)['error']['code'] === 'not_found'
            && Database::$calls === $filesBefore && Http::$calls === $callsBefore,
            'Disabled pilot must reject before validation, limiter configuration, filesystem or provider access.');
        $_SERVER['REMOTE_ADDR'] = '192.0.2.10';

        seedAdmission($db);
        $callsBefore = Http::$calls;
        for ($i = 0; $i < Limiter::LIMIT; $i++) {
            verifyAdmission(admissionRequest($app)->status === 200, 'Requests within allowance must succeed, including cached requests.');
        }
        $budgetBefore = admissionState($db)['nextRequestAt'];
        $blocked = admissionRequest($app, ['q' => 'different search']);
        verifyAdmission($blocked->status === 429 && json_decode($blocked->body(), true)['error']['code'] === 'rate_limited'
            && admissionHeaders($blocked) === ['Retry-After' => '60', 'Cache-Control' => 'no-store']
            && Http::$calls === $callsBefore + 1 && admissionState($db)['nextRequestAt'] === $budgetBefore,
            'Exhausted client must receive controlled 429 without consuming provider budget.');
        verifyAdmission(!str_contains($blocked->body(), $secret) && !str_contains($blocked->body(), '192.0.2.10'), 'Public limit errors leaked private identifiers.');
        foreach (['203.0.113.1', 'invalid', ['203.0.113.2'], '198.51.100.1, 192.0.2.10'] as $spoof) {
            $_SERVER['HTTP_X_FORWARDED_FOR'] = $spoof;
            $_SERVER['HTTP_FORWARDED'] = 'for=203.0.113.99';
            $_SERVER['HTTP_X_REAL_IP'] = '203.0.113.98';
            verifyAdmission(admissionRequest($app)->status === 429, 'Proxy header spoofing changed client identity.');
        }
        $_SERVER['REMOTE_ADDR'] = '::ffff:192.0.2.10';
        verifyAdmission(admissionRequest($app)->status === 429, 'IPv4-mapped IPv6 must share the IPv4 allowance.');
        $_SERVER['REMOTE_ADDR'] = '192.0.2.11';
        verifyAdmission(admissionRequest($app)->status === 200 && Http::$calls === $callsBefore + 1, 'Different clients need independent allowances on shared cache hits.');
        $_SERVER['REMOTE_ADDR'] = '192.0.2.10';
        $now = 1059.0;
        verifyAdmission(admissionHeaders(admissionRequest($app))['Retry-After'] === '1', 'Retry-After must reflect the remaining window.');
        $now = 1060.0;
        verifyAdmission(admissionRequest($app)->status === 200, 'Allowance must expire at the exact rolling-window boundary.');
        $stored = $db->raw;
        verifyAdmission(count(admissionState($db)['clients']) === 1 && !str_contains($stored, '192.0.2.')
            && !str_contains($stored, $secret) && !str_contains($stored, 'fixture@example.test'), 'Expired identities or private values were persisted.');

        seedAdmission($db);
        foreach ([1100, 1101, 1102, 1103, 1159] as $time) {
            $now = (float) $time;
            verifyAdmission(admissionRequest($app)->status === 200, 'Rolling allowance unexpectedly rejected a valid request.');
        }
        $now = 1160.0;
        verifyAdmission(admissionRequest($app)->status === 200, 'Oldest admission must expire independently.');
        $blocked = admissionRequest($app);
        verifyAdmission($blocked->status === 429 && admissionHeaders($blocked)['Retry-After'] === '1', 'Limiter must not reset every admission at a fixed-window boundary.');

        seedAdmission($db);
        $now = 1200.75;
        for ($i = 0; $i < Limiter::LIMIT; $i++) admissionRequest($app);
        $now = 1260.25;
        verifyAdmission(admissionRequest($app)->status === 429 && admissionHeaders(admissionRequest($app))['Retry-After'] === '1',
            'Fractional-second admissions must not expire early through rounding.');
        $now = 1260.75;
        verifyAdmission(admissionRequest($app)->status === 200, 'Fractional-second window must expire at the exact boundary.');

        seedAdmission($db);
        $callsBefore = Http::$calls;
        foreach ([2000, 2012, 2024, 2036, 2048] as $time) {
            $now = (float) $time;
            verifyAdmission(admissionRequest($app, ['q' => 'unique ' . $time])->status === 200, 'Distinct searches within client allowance should preserve provider scheduling.');
        }
        $now = 2059.0;
        verifyAdmission(admissionRequest($app, ['q' => 'sixth unique'])->status === 429 && Http::$calls === $callsBefore + 5,
            'One client must not exhaust the shared provider budget with distinct queries.');
        $_SERVER['REMOTE_ADDR'] = '192.0.2.12';
        verifyAdmission(admissionRequest($app, ['q' => 'other client'])->status === 200 && Http::$calls === $callsBefore + 6,
            'A limited client must leave provider capacity available to another client.');

        seedAdmission($db);
        $now = 3000.0;
        $_SERVER['REMOTE_ADDR'] = '2001:db8::1';
        for ($i = 0; $i < Limiter::LIMIT; $i++) verifyAdmission(admissionRequest($app)->status === 200, 'IPv6 admission failed.');
        $_SERVER['REMOTE_ADDR'] = '2001:0db8:0000:0000:0:0:0:1';
        verifyAdmission(admissionRequest($app)->status === 429, 'Equivalent IPv6 spellings must share the same identifier.');

        seedAdmission($db);
        $callsBefore = Http::$calls;
        foreach ([null, '', [], 'invalid-address', '192.0.2.10:80'] as $address) {
            $_SERVER['REMOTE_ADDR'] = $address;
            verifyAdmission(admissionRequest($app)->status === 503, 'Invalid server address must fail closed even with spoofed proxy headers.');
        }
        $_SERVER['REMOTE_ADDR'] = '192.0.2.10';
        $noSecret = admissionApp(new OpenLibraryPilot($http, true, true, $store, 'MyFunList (fixture@example.test)', ''));
        verifyAdmission(admissionRequest($noSecret)->status === 503 && Http::$calls === $callsBefore, 'Missing secret must not bypass admission or reach providers.');

        $key = hash('sha256', 'fixture-client');
        seedAdmission($db);
        verifyAdmission(admissionRequest($app)->status === 200, 'Corrupt-state cache fixture failed.');
        $corruptCachedState = admissionState($db);
        unset($corruptCachedState['clients']);
        $db->raw = json_encode($corruptCachedState);
        verifyAdmission(admissionRequest($app)->status === 503, 'A populated public cache must not bypass missing admission state.');
        $callsBefore = Http::$calls;
        $badStates = ['', '{broken', json_encode(['version' => 1, 'nextRequestAt' => 0, 'cache' => []]),
            json_encode(['version' => 2, 'nextRequestAt' => 0, 'cache' => []])];
        foreach ([null, ['raw-ip' => [3000]], [$key => []], [$key => ['3000']], [$key => [3000, 2999]],
            [$key => [3001]], [$key => [-1]], [$key => array_fill(0, 6, 3000)]] as $clients) {
            $badStates[] = json_encode(['version' => 3, 'updatedAt' => 0, 'reservation' => null, 'nextRequestAt' => 0, 'cache' => [], 'clients' => $clients]);
        }
        foreach ($badStates as $badState) {
            $db->raw = $badState;
            verifyAdmission(admissionRequest($app)->status === 503 && $db->raw === $badState,
                'Corrupt/legacy/missing admission state must fail closed without repair or reset.');
        }

        $clients = [];
        for ($i = 0; $i < Limiter::MAX_CLIENTS; $i++) $clients[hash('sha256', 'client ' . $i)] = [3000];
        seedAdmission($db, $clients);
        verifyAdmission(admissionRequest($app)->status === 503 && admissionState($db)['clients'] === $clients,
            'Capacity exhaustion must not evict active counters or allow untracked clients.');
        $now = 3060.0;
        verifyAdmission(admissionRequest($app)->status === 200 && count(admissionState($db)['clients']) === 1,
            'Expired client storage must be reclaimed before applying capacity limits.');

        seedAdmission($db);
        $now = 4000.0;
        for ($i = 0; $i < Limiter::LIMIT; $i++) verifyAdmission(admissionRequest($app, [])->status === 422, 'Invalid input should consume admission without provider I/O.');
        verifyAdmission(admissionRequest($app)->status === 429, 'Invalid input must not bypass admission.');

        seedAdmission($db);
        $now = 5000.0;
        verifyAdmission(admissionRequest($app)->status === 200, 'Cooldown cache fixture failed.');
        $now = 5002.0;
        Http::$fail = true;
        verifyAdmission(admissionRequest($app, ['q' => 'failure'])->status === 503, 'Existing provider failure classification changed.');
        $callsBefore = Http::$calls;
        verifyAdmission(admissionRequest($app)->status === 200 && admissionRequest($app, ['q' => 'blocked by cooldown'])->status === 503
            && Http::$calls === $callsBefore && admissionState($db)['nextRequestAt'] === 5062,
            'Client admission must preserve cached responses and the shared provider cooldown.');
        verifyAdmission(admissionRequest($app)->status === 200 && admissionRequest($app)->status === 429, 'Cache/cooldown attempts must all count toward admission.');
        Http::$fail = false;

        seedAdmission($db);
        $now = 5500.0;
        $callsBefore = Http::$calls;
        verifyAdmission(admissionRequest($app)->status === 200, 'Busy fixture did not warm cache.');
        $busy = admissionRequest($app, ['q' => 'another modern book']);
        verifyAdmission($busy->status === 503 && json_decode($busy->body(), true)['error']['code'] === 'provider_busy'
            && admissionHeaders($busy)['Retry-After'] === '2' && Http::$calls === $callsBefore + 1
            && count(array_values(admissionState($db)['clients'])[0]) === 2,
            'Interval contention must have short manual backoff, count admission and make no extra upstream call.');
        verifyAdmission(admissionRequest($app)->status === 200 && Http::$calls === $callsBefore + 1,
            'A cached result must remain usable during provider spacing.');
        $beforeState = $db->raw;
        $db->locked = true;
        $started = hrtime(true);
        $busy = admissionRequest($app);
        $db->locked = false;
        verifyAdmission($busy->status === 503 && json_decode($busy->body(), true)['error']['code'] === 'provider_busy'
            && admissionHeaders($busy)['Retry-After'] === '2' && Http::$calls === $callsBefore + 1
            && $db->raw === $beforeState && (hrtime(true) - $started) / 1e9 < 2,
            'Lock contention must end within a bounded local wait without state writes or upstream retries.');

        seedAdmission($db);
        $_ENV['OPEN_LIBRARY_PILOT_ENABLED'] = 'true';
        $_ENV['OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED'] = 'true';
        $_ENV['OPEN_LIBRARY_USER_AGENT'] = 'MyFunList (fixture@example.test)';
        $_ENV['RATE_LIMIT_SECRET'] = $secret;
        $_ENV['APP_ENV'] = 'testing';
        $_ENV['SESSION_SAVE_PATH'] = sys_get_temp_dir();
        $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] = '10';
        $_SERVER['HTTP_HOST'] = '127.0.0.1';
        unset($_SERVER['HTTPS'], $_SERVER['HTTP_COOKIE']);
        $bootstrap = require dirname(__DIR__) . '/config/bootstrap.php';
        $beforeDb = Database::$calls;
        $beforeHttp = Http::$calls;
        $beforeState = $db->raw;
        $response = admissionRequest($bootstrap);
        verifyAdmission($response->status === 401 && json_decode($response->body(), true)['error']['code'] === 'unauthenticated',
            'Anonymous pilot access must require the existing session.');
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer fixture-tester';
        $_SERVER['HTTP_X_USER_ID'] = '10';
        verifyAdmission(admissionRequest($bootstrap, ['q' => 'Hobbit', 'userId' => '10'])->status === 401,
            'Headers and query IDs must not replace session authentication.');
        $_SESSION['user_id'] = '20';
        $response = admissionRequest($bootstrap);
        verifyAdmission($response->status === 403 && admissionHeaders($response)['Cache-Control'] === 'no-store',
            'Ordinary authenticated users must not access the pilot.');
        $_SESSION['user_id'] = '10';
        foreach ([false, ['10'], '', '20', '110', '010', '10,', '10,,20', '10, 20', 'fixture@example.test', str_repeat('1', 420), implode(',', range(1, 21))] as $invalid) {
            $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] = $invalid;
            verifyAdmission(admissionRequest($bootstrap)->status === 403, 'Missing, malformed or nonmatching allowlists must fail closed.');
        }
        verifyAdmission(Database::$calls === $beforeDb && Http::$calls === $beforeHttp && $db->raw === $beforeState,
            'Rejected callers must not read or mutate coordinator/cache/client state or call providers.');
        $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] = '10,20';
        verifyAdmission(admissionRequest($bootstrap, [])->status === 422 && Http::$calls === $beforeHttp,
            'An authorized queryless probe must reach validation without provider I/O.');
        $_SESSION['user_id'] = '20';
        seedAdmission($db);
        verifyAdmission(admissionRequest($bootstrap)->status === 200, 'A second explicitly allowlisted session account must be authorized.');
        $_SESSION['user_id'] = '10';
        seedAdmission($db);
        for ($i = 0; $i < Limiter::LIMIT; $i++) verifyAdmission(admissionRequest($bootstrap)->status === 200, 'Actual bootstrap did not admit/cache valid requests.');
        verifyAdmission(admissionRequest($bootstrap)->status === 429 && Database::$calls > 0 && session_status() === PHP_SESSION_ACTIVE,
            'Authorized bootstrap requests must preserve admission with the existing session.');
        $beforeDb = Database::$calls;
        $beforeState = $db->raw;
        $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] = '20';
        verifyAdmission(admissionRequest($bootstrap)->status === 403 && Database::$calls === $beforeDb && $db->raw === $beforeState,
            'Revoking a tester must deny access even when public results are cached.');
        (new \MyFunList\Infrastructure\PhpSession())->logout();
        verifyAdmission(admissionRequest($bootstrap)->status === 401 && Database::$calls === $beforeDb,
            'Logging out must revoke pilot access without coordinator I/O.');
    } finally {
        if (session_status() === PHP_SESSION_ACTIVE) { $_SESSION = []; session_destroy(); }
        $_ENV = $originalEnvironment;
        $_SERVER = $originalServer;
        $_GET = $originalGet;
    }
    echo 'Open Library admission checks passed (', $checks, " assertions; fixture I/O only, no database/network requests).\n";
}
