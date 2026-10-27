<?php

declare(strict_types=1);

namespace {
    require dirname(__DIR__) . '/vendor/autoload.php';
}

namespace MyFunList\Infrastructure {
    // Alleen dit testproces vervangt opslag; elke SQL-opdracht buiten de limiter wordt geweigerd.
    final class CounterConnection extends \PDO
    {
        public array $rows = [];
        public int $queries = 0;
        public bool $unavailable = false;

        public function __construct()
        {
        }

        public function prepare(string $query, array $options = []): \PDOStatement|false
        {
            $this->queries++;
            if ($this->unavailable) throw new \PDOException('fixture-secret storage failure');
            $sql = preg_replace('/\s+/', ' ', trim($query));
            if (!str_starts_with($sql, 'INSERT INTO rate_limit_counters ')
                && !str_starts_with($sql, 'SELECT request_count FROM rate_limit_counters ')
                && !str_starts_with($sql, 'DELETE FROM rate_limit_counters ')) {
                throw new \RuntimeException('Unexpected application SQL in public detail lookup.');
            }
            return new CounterStatement($this, $sql);
        }
    }

    final class CounterStatement extends \PDOStatement
    {
        private mixed $result = false;

        public function __construct(private readonly CounterConnection $connection, private readonly string $sql)
        {
        }

        public function execute(?array $params = null): bool
        {
            if (str_starts_with($this->sql, 'DELETE')) {
                $deleted = 0;
                foreach ($this->connection->rows as $key => $row) {
                    if ($row['expires'] <= $params[0] && $deleted < 100) {
                        unset($this->connection->rows[$key]);
                        $deleted++;
                    }
                }
                return true;
            }
            $key = implode(':', array_slice($params, 0, 3));
            if (str_starts_with($this->sql, 'INSERT')) {
                $this->connection->rows[$key] = [
                    'count' => ($this->connection->rows[$key]['count'] ?? 0) + 1, 'expires' => $params[3],
                ];
            } else {
                $this->result = $this->connection->rows[$key]['count'] ?? false;
            }
            return true;
        }

        public function fetchColumn(int $column = 0): mixed
        {
            return $this->result;
        }
    }

    final class Database
    {
        public static ?CounterConnection $connection = null;

        public function connect(): \PDO
        {
            return self::$connection ??= new CounterConnection();
        }
    }
}

namespace MyFunList\RateLimit {
    final class FixtureClock
    {
        public static int $now = 1800000020;
    }

    function time(): int
    {
        return FixtureClock::$now;
    }
}

namespace MyFunList\Provider {
    // De echte bootstrap en normalisatie draaien, maar er gaat geen verzoek naar een provider.
    final class CurlProviderHttpClient implements ProviderHttpClient
    {
        public static int $calls = 0;

        public function get(string $url, array $headers = []): array
        {
            self::$calls++;
            $path = parse_url($url, PHP_URL_PATH);
            $id = substr($path, strrpos($path, '/') + 1);
            if (str_contains($path, '/volumes/')) return ['id' => $id, 'volumeInfo' => ['title' => 'Book']];
            return ['id' => $id, 'title' => 'Movie', 'name' => 'Show or game'];
        }
    }
}

namespace {
    use MyFunList\Http\JsonResponse;
    use MyFunList\Infrastructure\Database;
    use MyFunList\Provider\CurlProviderHttpClient;
    use MyFunList\RateLimit\FixtureClock;

    $checks = 0;
    function verifyMediaLimit(bool $condition, string $message): void
    {
        global $checks;
        $checks++;
        if (!$condition) throw new RuntimeException($message);
    }

    $originalEnvironment = $_ENV;
    $originalServer = $_SERVER;
    try {
        $_ENV['APP_ENV'] = 'testing';
        $_ENV['DB_PORT'] = 'invalid';
        $_ENV['RATE_LIMIT_SECRET'] = 'fixture-secret-at-least-thirty-two-characters';
        $_ENV['TMDB_API_TOKEN'] = $_ENV['RAWG_API_KEY'] = $_ENV['GOOGLE_BOOKS_API_KEY'] = 'fixture-secret';
        unset($_SERVER['HTTP_COOKIE'], $_SERVER['HTTP_AUTHORIZATION'], $_SERVER['HTTP_X_CSRF_TOKEN']);
        $_SERVER['REMOTE_ADDR'] = '203.0.113.80';
        $app = require dirname(__DIR__) . '/config/bootstrap.php';
        $connection = Database::$connection;
        verifyMediaLimit($connection === null && session_status() === PHP_SESSION_NONE,
            'Bootstrapping public routes must not connect to storage or open a session.');
        $policies = require dirname(__DIR__) . '/config/rate_limits.php';
        verifyMediaLimit($policies['media_detail_ip'] === ['limit' => 30, 'window' => 60]
            && $policies['discover_ip'] === ['limit' => 60, 'window' => 60],
            'Detail and Discover limits must remain distinct documented policies.');
        $paths = ['/api/v1/media/book/google-books/Ab_9-x', '/api/v1/media/movie/tmdb/42',
            '/api/v1/media/tv/tmdb/42', '/api/v1/media/game/rawg/62'];
        $headers = new ReflectionProperty(JsonResponse::class, 'headers');
        for ($request = 0; $request < 30; $request++) {
            $response = $app->handle('GET', $paths[$request % 4]);
            verifyMediaLimit($response->status === 200 && $headers->getValue($response)['Cache-Control'] === 'no-store',
                'Ordinary anonymous browsing must reach all real detail routes without HTTP caching.');
        }
        verifyMediaLimit(CurlProviderHttpClient::$calls === 30 && session_status() === PHP_SESSION_NONE,
            'Successful detail requests must perform one provider call each and never start authentication.');
        foreach ($paths as $path) {
            $response = $app->handle('GET', $path);
            $responseHeaders = $headers->getValue($response);
            verifyMediaLimit($response->status === 429 && $responseHeaders['Retry-After'] === '40'
                && $responseHeaders['Cache-Control'] === 'no-store'
                && json_decode($response->body(), true)['error']['code'] === 'rate_limited',
                'All detail types must share the detail IP limit and return a deterministic Retry-After.');
        }
        verifyMediaLimit(CurlProviderHttpClient::$calls === 30, 'Blocked details must not contact providers.');
        $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.99';
        verifyMediaLimit($app->handle('GET', $paths[0])->status === 429,
            'Forged proxy headers must not bypass the observed-IP detail limit.');

        $connection = Database::$connection;
        $queries = $connection->queries;
        foreach (['/api/v1/media/book/google-books/%2F', '/api/v1/media/movie/tmdb/0',
            '/api/v1/media/book/tmdb/42', '/api/v1/media/game/rawg/' . str_repeat('1', 21)] as $path) {
            verifyMediaLimit($app->handle('GET', $path)->status === 404 && $app->handle('POST', $path)->status === 404,
                'Invalid identities must stay 404 even when the detail IP is rate-limited.');
        }
        verifyMediaLimit($connection->queries === $queries && CurlProviderHttpClient::$calls === 30,
            'Invalid routes must not contact storage or providers.');
        verifyMediaLimit($app->handle('POST', $paths[0])->status === 405 && $connection->queries === $queries,
            'Unsupported methods must remain 405 without consuming the detail limit.');

        verifyMediaLimit($app->handle('GET', '/api/v1/discover/movie')->status === 422,
            'Exhausting detail limits must not exhaust the separate Discover policy.');
        $_SERVER['REMOTE_ADDR'] = '203.0.113.81';
        verifyMediaLimit($app->handle('GET', $paths[1])->status === 200,
            'A different observed IP must have an independent detail budget.');
        $_SERVER['REMOTE_ADDR'] = '203.0.113.80';
        FixtureClock::$now += 40;
        verifyMediaLimit($app->handle('GET', $paths[2])->status === 200,
            'A new fixed window must allow browsing again.');

        // Een tweede bootstrap gebruikt dezelfde opslag, zoals afzonderlijke PHP-workers dat doen.
        $otherApp = require dirname(__DIR__) . '/config/bootstrap.php';
        for ($request = 1; $request < 30; $request++) $otherApp->handle('GET', $paths[3]);
        verifyMediaLimit($app->handle('GET', $paths[0])->status === 429,
            'Separate application instances must share counters rather than local request state.');
        $calls = CurlProviderHttpClient::$calls;
        $connection->unavailable = true;
        $response = $app->handle('GET', $paths[0]);
        verifyMediaLimit($response->status === 503 && !str_contains($response->body(), 'fixture-secret')
            && json_decode($response->body(), true)['error']['code'] === 'service_unavailable'
            && CurlProviderHttpClient::$calls === $calls, 'Limiter storage failure must fail closed before provider access.');
        $connection->unavailable = false;
        $_ENV['APP_ENV'] = 'production';
        $_ENV['RATE_LIMIT_SECRET'] = '';
        $queries = $connection->queries;
        $response = $app->handle('GET', $paths[0]);
        verifyMediaLimit($response->status === 503 && $connection->queries === $queries
            && CurlProviderHttpClient::$calls === $calls && !str_contains($response->body(), 'RATE_LIMIT_SECRET'),
            'Missing production limiter configuration must fail safely before storage and provider access.');
        verifyMediaLimit(session_status() === PHP_SESSION_NONE, 'The endpoint must never start a session.');
        echo 'Media rate-limit pipeline checks passed (', $checks,
            " assertions; only counter SQL accepted by storage double, no database/network I/O).\n";
    } finally {
        $_ENV = $originalEnvironment;
        $_SERVER = $originalServer;
    }
}
