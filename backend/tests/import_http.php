<?php

declare(strict_types=1);

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Config;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Library\LibraryImportService;
use MyFunList\Library\LibraryService;
use MyFunList\Provider\MediaResolver;
use MyFunList\Provider\ProviderException;

require dirname(__DIR__) . '/config/environment.php';

function verifyImport(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function importItem(array $media, string $status, int|float|null $rating, string $addedAt): array
{
    return ['media' => $media, 'userMedia' => [
        'status' => $status, 'rating' => $rating, 'addedAt' => $addedAt,
    ]];
}

function importObjects(array $items): array
{
    return ['items' => json_decode(json_encode($items, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR)];
}

final class ImportFakeResolver implements MediaResolver
{
    public int $calls = 0;
    public bool $offline = false;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function resolve(string $source, string $mediaType, string $sourceId): array
    {
        verifyImport(!$this->connection->inTransaction(),
            'Provider resolution must happen outside a database transaction.');
        $this->calls++;
        if ($this->offline) {
            throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
        }

        return [
            'source' => $source,
            'mediaType' => $mediaType,
            'sourceId' => $sourceId,
            'title' => 'Authoritative ' . $mediaType,
            ...($mediaType === 'book' ? ['authors' => ['Fixture Author']] : []),
        ];
    }
}

final class ImportHttpClient
{
    private array $cookies = [];

    public function __construct(private readonly string $baseUrl)
    {
    }

    public function request(string $method, string $path, ?array $body = null, ?string $csrf = null,
        bool $malformed = false): array
    {
        $headers = ['Accept: application/json'];
        if ($body !== null || $malformed) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($csrf !== null) {
            $headers[] = 'X-CSRF-Token: ' . $csrf;
        }
        if ($this->cookies !== []) {
            $pairs = [];
            foreach ($this->cookies as $name => $value) {
                $pairs[] = $name . '=' . $value;
            }
            $headers[] = 'Cookie: ' . implode('; ', $pairs);
        }
        $context = stream_context_create(['http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $malformed ? '{' : ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR)),
            'ignore_errors' => true,
            'timeout' => 5,
        ]]);
        $raw = file_get_contents($this->baseUrl . $path, false, $context);
        verifyImport($raw !== false, 'Local import API did not respond.');
        preg_match('/^HTTP\/\S+ (\d{3})/', $http_response_header[0], $match);
        foreach ($http_response_header as $header) {
            if (stripos($header, 'Set-Cookie: ') !== 0) {
                continue;
            }
            [$name, $value] = array_pad(explode('=', explode(';', substr($header, 12))[0], 2), 2, '');
            if ($value === '' || str_contains(strtolower($header), 'max-age=0')) {
                unset($this->cookies[$name]);
            } else {
                $this->cookies[$name] = $value;
            }
        }

        try {
            $json = $raw === '' ? null : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('Import HTTP response was not JSON: ' . substr($raw, 0, 350));
        }

        return [
            'status' => (int) ($match[1] ?? 0),
            'body' => $raw,
            'json' => $json,
        ];
    }

    public function csrf(): string
    {
        $response = $this->request('GET', '/api/v1/auth/csrf');
        verifyImport($response['status'] === 200, 'Could not fetch CSRF token.');

        return $response['json']['data']['csrfToken'];
    }

    public function login(string $email, string $password): string
    {
        $token = $this->csrf();
        $response = $this->request('POST', '/api/v1/auth/login', [
            'email' => $email, 'password' => $password,
        ], $token);
        verifyImport($response['status'] === 200, 'Fixture login failed.');

        return $this->csrf();
    }
}

require __DIR__ . '/support/database.php';
$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
verifyImport($config['database'] === 'myfunlist_test'
    && in_array($config['host'], ['localhost', '127.0.0.1'], true),
    'Import tests may use only the local test database.');
$connection = (new Database())->connect();
verifyImport($connection->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'Import test connection selected the wrong database.');
foreach (['users', 'media', 'user_media'] as $table) {
    verifyImport((int) $connection->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn() === 0,
        'Import tests require empty local test tables.');
}

$suffix = bin2hex(random_bytes(6));
$bookId = 'import-' . $suffix;
$numberId = (string) random_int(10000000, 99999999);
$emailA = 'import-a-' . $suffix . '@example.test';
$emailB = 'import-b-' . $suffix . '@example.test';
$emailC = 'import-c-' . $suffix . '@example.test';
$password = bin2hex(random_bytes(16));
$resolver = new ImportFakeResolver($connection);
$library = new LibraryService(new Database(), $resolver);
$importer = new LibraryImportService($library);
$socket = null;
$process = null;
$serverLog = dirname(__DIR__) . '/var/import-test-server.log';
$tempDir = dirname(__DIR__) . '/var/import-test-tmp';

try {
    $insertUser = $connection->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $insertUser->execute([$emailA, $hash]);
    $userA = new AuthenticatedUser($connection->lastInsertId());
    $insertUser->execute([$emailB, $hash]);
    $userB = new AuthenticatedUser($connection->lastInsertId());
    $insertUser->execute([$emailC, $hash]);

    $identities = [
        'book' => ['source' => 'google-books', 'mediaType' => 'book', 'sourceId' => $bookId],
        'movie' => ['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => $numberId],
        'tv' => ['source' => 'tmdb', 'mediaType' => 'tv', 'sourceId' => $numberId],
        'game' => ['source' => 'rawg', 'mediaType' => 'game', 'sourceId' => $numberId],
    ];
    $originalTimes = [
        'book' => '2021-04-05T10:11:12Z',
        'movie' => '2022-03-04T13:14:15.123Z',
        'tv' => '2023-02-03T12:00:00+02:00',
        'game' => '2024-01-02T03:04:05Z',
    ];
    $batchA = [
        importItem($identities['book'], 'finished', null, $originalTimes['book']),
        importItem($identities['movie'], 'watched', 8.5, $originalTimes['movie']),
        importItem($identities['tv'], 'watching', 0.5, $originalTimes['tv']),
        importItem($identities['game'], 'dropped', 10, $originalTimes['game']),
    ];
    $first = $importer->import($userA, importObjects($batchA));
    verifyImport($first['summary'] === [
        'total' => 4, 'imported' => 4, 'existing' => 0, 'duplicate' => 0, 'failed' => 0,
    ] && $resolver->calls === 4, 'All four uncached media types must import through the resolver.');
    $listA = $library->list($userA);
    verifyImport(count($listA) === 4, 'Imported Library must contain four entries.');
    $byType = [];
    foreach ($listA as $item) {
        $byType[$item['media']['mediaType']] = $item;
        verifyImport(str_starts_with($item['media']['title'], 'Authoritative ')
            && !array_key_exists('clientTitle', $item['media']),
            'Shared metadata must come from the resolver.');
    }
    verifyImport($byType['book']['userMedia']['status'] === 'finished'
        && $byType['book']['userMedia']['rating'] === null
        && $byType['book']['userMedia']['addedAt'] === '2021-04-05T10:11:12.000000Z'
        && $byType['movie']['userMedia']['rating'] === 8.5
        && $byType['movie']['userMedia']['addedAt'] === '2022-03-04T13:14:15.123000Z'
        && $byType['tv']['userMedia']['addedAt'] === '2023-02-03T10:00:00.000000Z'
        && $byType['game']['userMedia']['rating'] === 10.0,
        'Imported personal state and UTC timestamp must be preserved.');
    $stored = $connection->prepare(<<<'SQL'
SELECT um.status, um.rating, um.added_at FROM user_media um
JOIN media m ON m.id = um.media_id
WHERE um.user_id = ? AND m.source = ? AND m.media_type = ? AND m.source_id = ?
SQL);
    $stored->execute([$userA->id, 'tmdb', 'tv', $numberId]);
    $storedTv = $stored->fetch();
    verifyImport($storedTv['status'] === 'watching' && (float) $storedTv['rating'] === 0.5
        && $storedTv['added_at'] === '2023-02-03 10:00:00.000000',
        'Imported UTC state must be persisted explicitly.');

    $second = $importer->import($userA, importObjects($batchA));
    verifyImport($second['summary'] === [
        'total' => 4, 'imported' => 0, 'existing' => 4, 'duplicate' => 0, 'failed' => 0,
    ] && $library->list($userA) === $listA && $resolver->calls === 4,
        'Retry must be naturally idempotent and preserve existing data.');

    $normal = $library->add($userB, ['media' => (object) $identities['movie']]);
    verifyImport($normal['added'] && $normal['item']['userMedia']['status'] === 'want-to-watch'
        && $normal['item']['userMedia']['rating'] === null
        && $normal['item']['userMedia']['addedAt'] !== $originalTimes['movie'],
        'Normal POST must retain default status, null rating, and current addedAt.');
    $normalUpdated = $library->update($userB, $normal['item']['userMedia']['id'],
        ['status' => 'watched', 'rating' => 9]);
    $resolver->offline = true;
    $callsBefore = $resolver->calls;
    $existingConflict = $importer->import($userB, importObjects([
        importItem($identities['movie'], 'want-to-watch', 1, '2020-01-01T00:00:00Z'),
    ]));
    verifyImport($existingConflict['summary']['existing'] === 1
        && $library->list($userB)[0] === $normalUpdated
        && $resolver->calls === $callsBefore,
        'Existing account status, rating, and addedAt must win conflicts.');

    $cached = $importer->import($userB, importObjects([
        importItem($identities['book'], 'reading', 7.5, '2020-02-03T04:05:06Z'),
    ]));
    verifyImport($cached['summary']['imported'] === 1 && $resolver->calls === $callsBefore,
        'Cached media must import while the provider is unavailable.');
    $countShared = $connection->prepare(
        'SELECT COUNT(*) FROM media WHERE source = ? AND media_type = ? AND source_id = ?',
    );
    $countShared->execute(['google-books', 'book', $bookId]);
    verifyImport((int) $countShared->fetchColumn() === 1,
        'Two users must share one media row with separate personal state.');

    $newId = (string) ((int) $numberId + 1);
    $partialItems = [
        importItem($identities['tv'], 'completed', 6, '2020-04-05T06:07:08Z'),
        importItem(['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => $newId],
            'watched', 7, '2020-04-05T06:07:08Z'),
        importItem($identities['game'], 'playing', null, '2020-04-05T06:07:08Z'),
    ];
    $partial = $importer->import($userB, importObjects($partialItems));
    verifyImport($partial['summary'] === [
        'total' => 3, 'imported' => 2, 'existing' => 0, 'duplicate' => 0, 'failed' => 1,
    ] && $partial['results'][1]['error']['code'] === 'provider_unavailable'
        && count($library->list($userB)) === 4,
        'One provider failure must not discard other import items.');
    $countShared->execute(['tmdb', 'movie', $newId]);
    verifyImport((int) $countShared->fetchColumn() === 0,
        'Provider failure must not create partial shared media.');

    $duplicateBatch = $importer->import($userB, importObjects([
        importItem($identities['tv'], 'watching', 9, '2020-01-01T00:00:00Z'),
        importItem($identities['tv'], 'want-to-watch', null, '2019-01-01T00:00:00Z'),
    ]));
    verifyImport($duplicateBatch['summary']['existing'] === 1
        && $duplicateBatch['summary']['duplicate'] === 1
        && $duplicateBatch['results'][1]['status'] === 'duplicate',
        'Later duplicate identity in one batch must be skipped.');

    $invalidBatch = $importer->import($userB, importObjects([
        importItem($identities['book'], 'watched', null, '2020-01-01T00:00:00Z'),
        importItem($identities['book'], 'reading', 0, '2020-01-01T00:00:00Z'),
        importItem($identities['book'], 'reading', null, '2020-02-30T00:00:00Z'),
        importItem(['source' => 'rawg', 'mediaType' => 'book', 'sourceId' => $numberId],
            'finished', null, '2020-01-01T00:00:00Z'),
        importItem($identities['book'] + ['title' => 'Client title'],
            'reading', null, '2020-01-01T00:00:00Z'),
        importItem($identities['book'], 'reading', null, '9999-01-01T00:00:00Z'),
        importItem($identities['book'], 'reading', null, '2020-01-01T00:00:00+25:00'),
        [
            'media' => $identities['book'],
            'userMedia' => ['status' => 'reading', 'rating' => null,
                'addedAt' => '2020-01-01T00:00:00Z', 'id' => '1'],
        ],
        importItem($identities['book'], 'reading', null, '1970-01-01T00:00:00Z'),
    ]));
    verifyImport($invalidBatch['summary']['failed'] === 8
        && $invalidBatch['summary']['existing'] === 1,
        'Invalid personal state and identity must fail without changing cached account state.');
    verifyImport($invalidBatch['results'][0]['error']['code'] === 'validation_error'
        && $invalidBatch['results'][2]['error']['code'] === 'validation_error',
        'Item validation failures need safe result codes.');
    $tooMany = array_fill(0, LibraryImportService::MAX_ITEMS + 1, $batchA[0]);
    try {
        $importer->import($userB, importObjects($tooMany));
        throw new RuntimeException('Oversized batch was accepted.');
    } catch (MyFunList\Http\ApiException $exception) {
        verifyImport($exception->status === 422 && $exception->errorCode === 'batch_too_large',
            'Oversized batch must return 422.');
    }

    $socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
    verifyImport($socket !== false, 'Could not reserve a local API port.');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $socket = null;
    $port = (int) substr(strrchr($address, ':'), 1);
    $baseUrl = 'http://127.0.0.1:' . $port;
    if (!is_dir($tempDir)) {
        mkdir($tempDir, 0700, true);
    }
    $environment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
        'APP_ENV' => 'testing', 'DB_DATABASE' => 'myfunlist_test',
        'TMDB_API_TOKEN' => '', 'RAWG_API_KEY' => '', 'GOOGLE_BOOKS_API_KEY' => '',
        'TMP' => $tempDir, 'TEMP' => $tempDir, 'TMPDIR' => $tempDir,
    ]);
    $process = proc_open(
        [PHP_BINARY, '-d', 'sys_temp_dir=' . $tempDir,
            '-d', 'upload_tmp_dir=' . $tempDir,
            '-S', '127.0.0.1:' . $port, '-t', 'public', 'public/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
        $pipes, dirname(__DIR__), $environment,
    );
    verifyImport(is_resource($process), 'Could not start local API server.');
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        if (@file_get_contents($baseUrl . '/api/v1/health') !== false) {
            $ready = true;
            break;
        }
        usleep(100000);
    }
    verifyImport($ready, 'Local API server did not start.');

    $anonymous = new ImportHttpClient($baseUrl);
    verifyImport($anonymous->request('POST', '/api/v1/library/import', ['items' => []])['status'] === 401,
        'Anonymous import must return 401.');
    $client = new ImportHttpClient($baseUrl);
    $csrf = $client->login($emailB, $password);
    verifyImport($client->request('POST', '/api/v1/library/import', ['items' => []])['status'] === 403,
        'Import without CSRF must return 403.');
    verifyImport($client->request('POST', '/api/v1/library/import', null, $csrf, true)['status'] === 400,
        'Malformed import JSON must return 400.');
    verifyImport($client->request('POST', '/api/v1/library/import', ['version' => 2], $csrf)['status'] === 422,
        'Raw storage document must be rejected.');
    $oversizeHttp = $client->request('POST', '/api/v1/library/import',
        ['items' => $tooMany], $csrf);
    verifyImport($oversizeHttp['status'] === 422
        && $oversizeHttp['json']['error']['code'] === 'batch_too_large',
        'Oversized HTTP import must return 422.');
    $tooLargeBody = $client->request('POST', '/api/v1/library/import',
        ['items' => [], 'padding' => str_repeat('x', LibraryImportService::MAX_BODY_BYTES)], $csrf);
    verifyImport($tooLargeBody['status'] === 413
        && $tooLargeBody['json']['error']['code'] === 'request_too_large',
        'Oversized import JSON body must return 413.');
    $liveBatch = [
        importItem($identities['movie'], 'want-to-watch', 1, '2020-01-01T00:00:00Z'),
        importItem($identities['book'], 'reading', null, '2020-02-03T04:05:06Z'),
        importItem(['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => $newId],
            'watched', 5, '2020-01-01T00:00:00Z'),
        importItem($identities['book'], 'finished', 10, '2019-01-01T00:00:00Z'),
    ];
    $live = $client->request('POST', '/api/v1/library/import', ['items' => $liveBatch], $csrf);
    verifyImport($live['status'] === 200 && $live['json']['data']['summary'] === [
        'total' => 4, 'imported' => 0, 'existing' => 2, 'duplicate' => 1, 'failed' => 1,
    ] && $live['json']['data']['results'][2]['error']['code'] === 'provider_unavailable'
        && !str_contains($live['body'], 'TMDB_API_TOKEN'),
        'Live import must return a safe per-item summary.');
    $list = $client->request('GET', '/api/v1/library');
    verifyImport($list['status'] === 200 && count($list['json']['data']) === 4,
        'Live import must preserve existing account Library data.');

    $freshClient = new ImportHttpClient($baseUrl);
    $freshCsrf = $freshClient->login($emailC, $password);
    $freshBatch = [importItem($identities['book'], 'finished', 6.5, '2021-07-08T09:10:11Z')];
    $fresh = $freshClient->request('POST', '/api/v1/library/import', ['items' => $freshBatch], $freshCsrf);
    $freshList = $freshClient->request('GET', '/api/v1/library');
    verifyImport($fresh['status'] === 200 && $fresh['json']['data']['summary']['imported'] === 1
        && $freshList['json']['data'][0]['userMedia']['status'] === 'finished'
        && $freshList['json']['data'][0]['userMedia']['rating'] === 6.5
        && $freshList['json']['data'][0]['userMedia']['addedAt'] === '2021-07-08T09:10:11.000000Z',
        'Live HTTP import must create an owned entry with preserved personal state.');
    $freshRetry = $freshClient->request('POST', '/api/v1/library/import',
        ['items' => $freshBatch], $freshCsrf);
    verifyImport($freshRetry['json']['data']['summary']['imported'] === 0
        && $freshRetry['json']['data']['summary']['existing'] === 1,
        'Live HTTP import retry must be idempotent.');
    $limitBatch = array_fill(0, LibraryImportService::MAX_ITEMS, $freshBatch[0]);
    $atLimit = $freshClient->request('POST', '/api/v1/library/import',
        ['items' => $limitBatch], $freshCsrf);
    verifyImport($atLimit['status'] === 200
        && $atLimit['json']['data']['summary']['total'] === LibraryImportService::MAX_ITEMS
        && $atLimit['json']['data']['summary']['existing'] === 1
        && $atLimit['json']['data']['summary']['duplicate'] === LibraryImportService::MAX_ITEMS - 1,
        'A 200-item batch must be accepted and de-duplicated.');

    $resolver->offline = false;
    $recovered = $importer->import($userB, importObjects($partialItems));
    $retried = $importer->import($userB, importObjects($partialItems));
    verifyImport($recovered['summary']['imported'] === 1
        && $recovered['summary']['existing'] === 2
        && $retried['summary']['imported'] === 0
        && $retried['summary']['existing'] === 3,
        'Retry after provider recovery must add only the failed item once.');

    echo "Library import service and HTTP tests passed.\n";
} finally {
    if (is_resource($socket)) {
        fclose($socket);
    }
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
    @unlink($serverLog);
    @rmdir($tempDir);
    $deleteUsers = $connection->prepare('DELETE FROM users WHERE email IN (?, ?, ?)');
    $deleteUsers->execute([$emailA, $emailB, $emailC]);
    $deleteMedia = $connection->prepare('DELETE FROM media WHERE source_id IN (?, ?, ?)');
    $deleteMedia->execute([$bookId, $numberId, (string) ((int) $numberId + 1)]);
}
