<?php

declare(strict_types=1);

namespace {
    require dirname(__DIR__) . '/vendor/autoload.php';
}

namespace MyFunList\Infrastructure {
    // Elke databaseverbinding is verboden in deze pilot-API-tests, inclusief Library- en List-opslag.
    final class Database
    {
        public static int $calls = 0;
        public function connect(): \PDO
        {
            self::$calls++;
            throw new \RuntimeException('Unexpected database access.');
        }
        public function check(): void { $this->connect(); }
    }
}

namespace MyFunList\Provider {
    // Alleen deze tests vervangen transport; de bestaande HTTP-suite test de echte cURL-verwerking.
    final class CurlProviderHttpClient implements ProviderHttpClient
    {
        public static int $calls = 0;
        public static array $payload = [];
        public static ?ProviderException $failure = null;
        public static string $url = '';
        public static array $headers = [];
        public function get(string $url, array $headers = []): array
        {
            self::$calls++;
            self::$url = $url;
            self::$headers = $headers;
            if (self::$failure !== null) throw self::$failure;
            return self::$payload;
        }
    }
}

namespace {
    use MyFunList\Http\ApiException;
    use MyFunList\Http\Application;
    use MyFunList\Http\Controllers\OpenLibraryController;
    use MyFunList\Http\Router;
    use MyFunList\Infrastructure\Database;
    use MyFunList\Provider\CurlProviderHttpClient as Http;
    use MyFunList\Provider\OpenLibraryAdapter;
    use MyFunList\Provider\OpenLibraryPilot;
    use MyFunList\Provider\OpenLibraryQuery as Query;
    use MyFunList\Provider\ProviderException;

    $checks = 0;
    function verifyOpenLibrary(bool $condition, string $message): void
    {
        global $checks;
        $checks++;
        if (!$condition) throw new RuntimeException($message);
    }
    function expectOpenLibrary(callable $action, int $status): void
    {
        try { $action(); }
        catch (ApiException|ProviderException $exception) {
            verifyOpenLibrary($exception->status === $status, 'Unexpected error status.');
            return;
        }
        throw new RuntimeException('Expected failure.');
    }
    function resetOpenLibraryState(string $file, array $cache = [], float $next = 0): void
    {
        file_put_contents($file, json_encode(['version' => 1, 'nextRequestAt' => $next, 'cache' => $cache], JSON_THROW_ON_ERROR));
    }

    $originalEnvironment = $_ENV;
    $originalServer = $_SERVER;
    $originalGet = $_GET;
    $originalFlag = getenv('OPEN_LIBRARY_PILOT_ENABLED');
    $stateFile = tempnam(sys_get_temp_dir(), 'mfl-ol-');
    $marker = tempnam(sys_get_temp_dir(), 'mfl-ol-worker-');
    if ($stateFile === false || $marker === false) throw new RuntimeException('Temporary files unavailable.');
    $stateFile = realpath($stateFile);
    chmod($stateFile, 0600);
    $fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/open_library.json'), true, 512, JSON_THROW_ON_ERROR);
    $http = new Http();
    $adapter = new OpenLibraryAdapter($http, 'MyFunList (fixture@example.test)');
    $pilot = new OpenLibraryPilot($http, true, true, $stateFile, 'MyFunList (fixture@example.test)');
    try {
        Http::$payload = $fixture;
        foreach (['general', 'title', 'author', 'isbn'] as $field) {
            $query = Query::fromParameters(['q' => $field === 'isbn' ? '978-0-261-10334-4' : '  The Hobbit  ', 'field' => $field]);
            $result = $adapter->search($query);
            parse_str(parse_url(Http::$url, PHP_URL_QUERY), $sent);
            verifyOpenLibrary(isset($sent[$field === 'general' ? 'q' : $field]) && $sent['limit'] === '10'
                && !str_contains($sent['fields'], '*') && Http::$headers === ['User-Agent: MyFunList (fixture@example.test)'],
                'Search mode, bounds, projection or identification lost.');
            verifyOpenLibrary(count($result['items']) === ($field === 'isbn' ? 1 : 2), 'ISBN selection must verify the selected edition.');
        }
        $book = $adapter->search(Query::fromParameters(['q' => 'Hobbit']))['items'][0];
        verifyOpenLibrary($book['provider'] === 'open-library' && $book['workId'] === 'OL27482W'
            && $book['selectedEdition']['editionId'] === 'OL10236414M' && $book['firstPublicationYear'] === 1937
            && $book['selectedEdition']['publicationDates'] === ['1995'] && $book['editionCount'] === 482
            && $book['selectedEdition']['isbns'] === ['9780261103344', '0261103342']
            && $book['cover']['id'] === 200, 'Work/Edition fields or ISBN validation changed.');
        verifyOpenLibrary(!str_contains(json_encode($book), 'private-fixture') && !isset($book['sourceId'], $book['userMedia']),
            'Pilot results must not acquire canonical saved identities or private data.');
        $sparse = $adapter->search(Query::fromParameters(['q' => 'Hobbit']))['items'][1];
        verifyOpenLibrary($sparse['selectedEdition'] === null && $sparse['authors'] === [] && $sparse['cover'] === null
            && $sparse['provenance']['authors']['state'] === 'missing', 'Missing fields need explicit states and no invented edition.');

        foreach ([[], ['q' => ''], ['q' => '  '], ['q' => []], ['q' => "x\ny"], ['q' => "bad\0"], ['q' => "\xFF"],
            ['q' => str_repeat('x', 201)], ['q' => 'x', 'field' => 'unknown'], ['q' => 'x', 'language' => 'eng'],
            ['q' => 'x', 'languageMode' => 'strict'], ['q' => 'x', 'languageMode' => 'unknown'],
            ['q' => 'x', 'limit' => '0'], ['q' => 'x', 'limit' => '11'], ['q' => 'x', 'limit' => '01'],
            ['q' => 'x', 'page' => '2'], ['q' => '9780261103345', 'field' => 'isbn'],
            ['q' => '0261103343', 'field' => 'isbn'], ['q' => 'not-isbn', 'field' => 'isbn']] as $invalid) {
            expectOpenLibrary(static fn () => Query::fromParameters($invalid), 422);
        }
        verifyOpenLibrary(Query::validIsbn('0261103342') && Query::validIsbn('080442957X') && !Query::validIsbn('0000000000000'), 'ISBN checksums failed.');
        $escaped = Query::fromParameters(['q' => 'x) OR language:tur', 'language' => 'en', 'languageMode' => 'strict'])->providerParameters();
        verifyOpenLibrary($escaped['q'] === '("x)" "OR" "language:tur") AND language:eng', 'Query text must not override strict language policy.');

        foreach (Query::LANGUAGES as $language => $code) {
            Http::$payload = $fixture;
            Http::$payload['docs'][0]['editions']['docs'][0]['language'] = [$code];
            $strict = Query::fromParameters(['q' => 'Hobbit', 'language' => $language, 'languageMode' => 'strict']);
            $result = $adapter->search($strict);
            verifyOpenLibrary($strict->providerParameters()['lang'] === $language && str_contains($strict->providerParameters()['q'], 'language:' . $code)
                && count($result['items']) === 1 && $result['items'][0]['selectedEdition']['languageStatus'] === 'match'
                && $result['omitted']['language'] === 1, 'Explicit language mapping or selected-edition validation failed.');
        }
        foreach ([['dut'], [], ['eng', 'dut'], ['ENG'], ['eng', 1], ['und'], ['mul']] as $languages) {
            Http::$payload = $fixture;
            Http::$payload['docs'][0]['editions']['docs'][0]['language'] = $languages;
            $strict = $adapter->search(Query::fromParameters(['q' => 'Hobbit', 'language' => 'en', 'languageMode' => 'strict']));
            $preferred = $adapter->search(Query::fromParameters(['q' => 'Hobbit', 'language' => 'en']));
            verifyOpenLibrary($strict['items'] === [] && $strict['omitted']['language'] === 2 && count($preferred['items']) === 2,
                'Strict must omit uncertain languages; preference must retain them.');
        }
        Http::$payload = $fixture;
        Http::$payload['docs'][0]['language'] = ['dut'];
        $inconsistent = $adapter->search(Query::fromParameters(['q' => 'Hobbit', 'language' => 'en']));
        verifyOpenLibrary($inconsistent['items'][0]['selectedEdition']['languageStatus'] === 'inconsistent', 'Contradictory language metadata lost.');
        Http::$payload = $fixture;
        unset(Http::$payload['docs'][0]['language']);
        Http::$payload['docs'][0]['editions']['docs'][0]['language'] = ['und'];
        verifyOpenLibrary($adapter->search(Query::fromParameters(['q' => 'Hobbit']))['items'][0]['selectedEdition']['languageStatus'] === 'unknown',
            'Undetermined language must stay unknown.');
        Http::$payload = $fixture;
        Http::$payload['docs'][0]['editions']['docs'][0]['key'] = '/works/OL27482W';
        $wrongId = $adapter->search(Query::fromParameters(['q' => 'Hobbit']));
        verifyOpenLibrary($wrongId['items'][0]['selectedEdition'] === null
            && $wrongId['items'][0]['cover']['id'] === 100
            && $wrongId['items'][0]['provenance']['selectedEdition']['state'] === 'invalid', 'Work ID was treated as an edition.');
        foreach ([['docs' => []], ['numFound' => 0, 'docs' => 'bad'], ['numFound' => 0, 'docs' => [[]]],
            ['numFound' => 1, 'docs' => []], ['numFound' => 1, 'docs' => [['key' => '/books/OL12M', 'title' => 'Wrong identity']]]] as $malformed) {
            Http::$payload = $malformed;
            expectOpenLibrary(static fn () => $adapter->search(Query::fromParameters(['q' => 'Hobbit'])), 502);
        }
        Http::$payload = ['num_found' => 0, 'docs' => []];
        verifyOpenLibrary($adapter->search(Query::fromParameters(['q' => 'none']))['items'] === [], 'Empty success must differ from errors.');
        Http::$payload = ['numFound' => 100, 'docs' => array_fill(0, 40, $fixture['docs'][0])];
        $bounded = $adapter->search(Query::fromParameters(['q' => 'Hobbit', 'limit' => '2']));
        verifyOpenLibrary(count($bounded['items']) === 1 && $bounded['omitted']['duplicateWork'] === 1, 'Bounds or work deduplication failed.');
        Http::$payload = $fixture;

        resetOpenLibraryState($stateFile);
        $before = Http::$calls;
        $first = $pilot->search(['q' => 'Hobbit']);
        $otherWorker = new OpenLibraryPilot($http, true, true, $stateFile, 'MyFunList (fixture@example.test)');
        verifyOpenLibrary($otherWorker->search(['q' => 'Hobbit']) === $first && Http::$calls === $before + 1,
            'Separate pilot instances must share cached results and suppress duplicate provider calls.');
        expectOpenLibrary(static fn () => $otherWorker->search(['q' => 'Dune']), 503);
        verifyOpenLibrary(Http::$calls === $before + 1, 'Shared request budget permitted an immediate second request.');
        $state = json_decode(file_get_contents($stateFile), true);
        verifyOpenLibrary(!str_contains(file_get_contents($stateFile), 'fixture@example.test')
            && !str_contains(file_get_contents($stateFile), 'private-fixture'), 'Cache must contain public normalized data only.');
        $state['cache'][array_key_first($state['cache'])]['expiresAt'] = 0;
        $state['nextRequestAt'] = 0;
        file_put_contents($stateFile, json_encode($state));
        $pilot->search(['q' => 'Hobbit']);
        verifyOpenLibrary(Http::$calls === $before + 2, 'Expired cache must not be served.');
        for ($i = 0; $i < 22; $i++) {
            $state = json_decode(file_get_contents($stateFile), true);
            $state['nextRequestAt'] = 0;
            file_put_contents($stateFile, json_encode($state));
            $pilot->search(['q' => 'fixture ' . $i]);
        }
        verifyOpenLibrary(count(json_decode(file_get_contents($stateFile), true)['cache']) === 20, 'Shared cache must remain bounded.');
        resetOpenLibraryState($stateFile);
        $largeDoc = $fixture['docs'][0];
        $largeDoc['author_name'] = $largeDoc['editions']['docs'][0]['publish_date'] =
            array_map(static fn (int $i): string => str_repeat('x', 490) . $i, range(1, 30));
        Http::$payload = ['numFound' => 10, 'docs' => array_map(static function (int $i) use ($largeDoc): array {
            return [...$largeDoc, 'key' => 'OL' . (100 + $i) . 'W'];
        }, range(1, 10))];
        for ($i = 0; $i < 8; $i++) {
            $state = json_decode(file_get_contents($stateFile), true);
            $state['nextRequestAt'] = 0;
            file_put_contents($stateFile, json_encode($state));
            $pilot->search(['q' => 'large fixture ' . $i]);
        }
        clearstatcache(true, $stateFile);
        verifyOpenLibrary(filesize($stateFile) <= 2097152 && count(json_decode(file_get_contents($stateFile), true)['cache']) < 8,
            'Cache byte bound must evict entries independently of the entry limit.');
        resetOpenLibraryState($stateFile);
        Http::$payload = ['numFound' => 0, 'docs' => []];
        $before = Http::$calls;
        $pilot->search(['q' => 'none']);
        $otherWorker->search(['q' => 'none']);
        verifyOpenLibrary(Http::$calls === $before + 1, 'Successful empty responses should be cached.');

        $controller = new OpenLibraryController($pilot);
        foreach ([429, 503, 502] as $failure) {
            resetOpenLibraryState($stateFile);
            Http::$failure = new ProviderException($failure, 'unsafe', 'secret@example.test fixture-secret');
            $response = $controller->search(['q' => 'failure']);
            verifyOpenLibrary($response->status === ($failure === 502 ? 502 : 503)
                && !str_contains($response->body(), 'fixture-secret') && !str_contains($response->body(), '@'), 'Error responses must be safe and distinct from empty results.');
            $before = Http::$calls;
            expectOpenLibrary(static fn () => $pilot->search(['q' => 'failure']), 503);
            verifyOpenLibrary(Http::$calls === $before && json_decode(file_get_contents($stateFile), true)['nextRequestAt'] > microtime(true) + 58,
                'Failures must consume the shared budget and impose a cooldown.');
        }
        Http::$failure = null;
        resetOpenLibraryState($stateFile);
        Http::$payload = ['numFound' => 1, 'docs' => 'malformed'];
        verifyOpenLibrary($controller->search(['q' => 'bad-payload'])->status === 502, 'Malformed payloads must not become cached empty responses.');
        verifyOpenLibrary(json_decode(file_get_contents($stateFile), true)['cache'] === [], 'Malformed responses must not enter the cache.');
        Http::$payload = $fixture;
        foreach (['', '{}', '{broken', str_repeat('x', 2097153)] as $broken) {
            file_put_contents($stateFile, $broken);
            expectOpenLibrary(static fn () => $pilot->search(['q' => 'Hobbit']), 503);
        }
        expectOpenLibrary(static fn () => (new OpenLibraryPilot($http, true, true, $stateFile . '.missing', 'MyFunList (fixture@example.test)'))->search(['q' => 'Hobbit']), 503);
        expectOpenLibrary(static fn () => (new OpenLibraryPilot($http, true, false, $stateFile, 'MyFunList (fixture@example.test)'))->search(['q' => 'Hobbit']), 503);
        foreach (['MyFunList', "MyFunList\r\nX-Injected: yes (fixture@example.test)"] as $agent) {
            expectOpenLibrary(static fn () => (new OpenLibraryPilot($http, true, true, $stateFile, $agent))->search(['q' => 'Hobbit']), 503);
        }
        resetOpenLibraryState($stateFile);
        $_SERVER['DOCUMENT_ROOT'] = dirname($stateFile);
        expectOpenLibrary(static fn () => $pilot->search(['q' => 'Hobbit']), 503);
        $_SERVER['DOCUMENT_ROOT'] = $originalServer['DOCUMENT_ROOT'] ?? '';

        $_ENV['OPEN_LIBRARY_STATE_FILE'] = $stateFile;
        $_ENV['OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED'] = 'true';
        $_ENV['OPEN_LIBRARY_USER_AGENT'] = 'MyFunList (fixture@example.test)';
        $_GET = ['q' => 'Hobbit'];
        unset($_ENV['OPEN_LIBRARY_PILOT_ENABLED'], $_SERVER['OPEN_LIBRARY_PILOT_ENABLED']);
        putenv('OPEN_LIBRARY_PILOT_ENABLED');
        expectOpenLibrary(static fn () => OpenLibraryPilot::fromEnvironment($http)->search(['q' => 'Hobbit']), 404);
        foreach (['', 'false', '1', 'TRUE'] as $disabled) {
            $_ENV['OPEN_LIBRARY_PILOT_ENABLED'] = $disabled;
            $app = require dirname(__DIR__) . '/config/bootstrap.php';
            $before = Http::$calls;
            verifyOpenLibrary($app->handle('GET', '/api/v1/pilot/open-library/search')->status === 404
                && Http::$calls === $before, 'The actual bootstrap must disable the pilot unless explicitly true.');
        }
        $_ENV['OPEN_LIBRARY_PILOT_ENABLED'] = 'true';
        resetOpenLibraryState($stateFile);
        $app = require dirname(__DIR__) . '/config/bootstrap.php';
        verifyOpenLibrary($app->handle('GET', '/api/v1/pilot/open-library/search')->status === 200, 'Pilot route failed.');
        verifyOpenLibrary($app->handle('POST', '/api/v1/pilot/open-library/search')->status === 405
            && $app->handle('GET', '/api/v1/discover/book')->status === 404
            && $app->handle('GET', '/api/v1/media/book/open-library/OL27482W')->status === 404,
            'Pilot must stay read-only and outside canonical media routes.');
        verifyOpenLibrary(Database::$calls === 0 && session_status() === PHP_SESSION_NONE, 'Pilot touched database or session state.');

        resetOpenLibraryState($stateFile);
        $command = [PHP_BINARY, __DIR__ . '/support/open_library_worker.php', $stateFile, $marker];
        $worker1 = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes1);
        if (!is_resource($worker1)) throw new RuntimeException('Worker unavailable.');
        fclose($pipes1[0]);
        $deadline = microtime(true) + 5;
        while (filesize($marker) === 0 && microtime(true) < $deadline) { usleep(10000); clearstatcache(true, $marker); }
        verifyOpenLibrary(filesize($marker) > 0, 'First worker did not reserve the shared request.');
        $worker2 = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes2);
        if (!is_resource($worker2)) throw new RuntimeException('Second worker unavailable.');
        fclose($pipes2[0]);
        $secondStatus = stream_get_contents($pipes2[1]);
        $firstStatus = stream_get_contents($pipes1[1]);
        $errors = stream_get_contents($pipes1[2]) . stream_get_contents($pipes2[2]);
        foreach ([$pipes1, $pipes2] as $pipes) { fclose($pipes[1]); fclose($pipes[2]); }
        $exit1 = proc_close($worker1);
        $exit2 = proc_close($worker2);
        verifyOpenLibrary($firstStatus === '200' && $secondStatus === '503' && $errors === '' && $exit1 === 0 && $exit2 === 0
            && file_get_contents($marker) === "fixture-call\n", 'Concurrent PHP workers exceeded the shared budget.');
        $before = Http::$calls;
        $pilot->search(['q' => 'Hobbit']);
        verifyOpenLibrary(Http::$calls === $before, 'Worker cache was not reusable across processes.');
        resetOpenLibraryState($stateFile);
        $crash = proc_open([...$command, 'crash'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $crashPipes);
        if (!is_resource($crash)) throw new RuntimeException('Crash worker unavailable.');
        fclose($crashPipes[0]);
        $crashOutput = stream_get_contents($crashPipes[1]) . stream_get_contents($crashPipes[2]);
        fclose($crashPipes[1]);
        fclose($crashPipes[2]);
        $crashExit = proc_close($crash);
        $reservation = json_decode(file_get_contents($stateFile), true);
        verifyOpenLibrary($crashExit === 0 && $crashOutput === '' && $reservation['cache'] === []
            && $reservation['nextRequestAt'] > microtime(true) + 58,
            'Abrupt worker exit during provider I/O must preserve the durable reservation.');
    } finally {
        $_ENV = $originalEnvironment;
        $_SERVER = $originalServer;
        $_GET = $originalGet;
        putenv($originalFlag === false ? 'OPEN_LIBRARY_PILOT_ENABLED' : 'OPEN_LIBRARY_PILOT_ENABLED=' . $originalFlag);
        unlink($stateFile);
        unlink($marker);
    }
    echo 'Open Library checks passed (', $checks, " assertions; fixture I/O only, no database/network requests).\n";
}
