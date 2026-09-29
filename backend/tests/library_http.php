<?php

declare(strict_types=1);

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Config;
use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Library\LibraryService;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;

require dirname(__DIR__) . '/config/environment.php';

function verifyLibrary(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectLibraryError(callable $operation, int $status): void
{
    try {
        $operation();
    } catch (ApiException $exception) {
        verifyLibrary($exception->status === $status, 'Wrong Library error status.');
        return;
    }

    throw new RuntimeException('Expected Library error was not returned.');
}

final class FakeProviderHttp implements ProviderHttpClient
{
    public int $calls = 0;
    public bool $offline = false;

    public function __construct(private readonly string $bookId, private readonly string $numberId)
    {
    }

    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        if ($this->offline) {
            throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
        }
        if (str_contains($url, '/volumes/' . $this->bookId)) {
            return ['id' => $this->bookId, 'volumeInfo' => [
                'title' => '  Fixture Book  ', 'authors' => [' A. Author '],
                'publishedDate' => '2024-05-01', 'imageLinks' => ['thumbnail' => 'http://example.test/book.jpg'],
                'description' => 'Book details',
            ]];
        }
        if (str_contains($url, '/movie/' . $this->numberId)) {
            verifyLibrary(in_array('Authorization: Bearer fixture-token', $headers, true),
                'TMDB token must be sent in a server header.');
            return [
                'id' => (int) $this->numberId, 'title' => 'Fixture Movie',
                'original_title' => 'Original Movie', 'release_date' => '2023-01-02',
                'poster_path' => '/poster.jpg', 'backdrop_path' => '/backdrop.jpg',
                'overview' => 'Movie details', 'original_language' => 'en',
            ];
        }
        if (str_contains($url, '/tv/' . $this->numberId)) {
            return [
                'id' => (int) $this->numberId, 'name' => 'Fixture Show',
                'original_name' => 'Original Show', 'first_air_date' => '2022-03-04',
                'poster_path' => '/show.jpg', 'overview' => 'Show details',
            ];
        }
        if (str_contains($url, '/games/' . $this->numberId)) {
            verifyLibrary(str_contains($url, 'key=fixture-key'), 'RAWG key must come from backend config.');
            return [
                'id' => (int) $this->numberId, 'name' => 'Fixture Game',
                'released' => '2021-06-07', 'background_image' => 'https://example.test/game.jpg',
                'platforms' => [['platform' => ['name' => 'PC']]],
            ];
        }
        if (str_contains($url, '/volumes/malformed-')) {
            $path = parse_url($url, PHP_URL_PATH);
            return ['id' => substr($path, strrpos($path, '/') + 1), 'volumeInfo' => []];
        }

        throw new ProviderException(404, 'media_not_found', 'Media was not found.');
    }
}

final class LibraryHttpClient
{
    private array $cookies = [];

    public function __construct(private readonly string $baseUrl)
    {
    }

    public function request(string $method, string $path, ?array $body = null, ?string $token = null): array
    {
        $headers = ['Accept: application/json'];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($token !== null) {
            $headers[] = 'X-CSRF-Token: ' . $token;
        }
        if ($this->cookies !== []) {
            $pairs = [];
            foreach ($this->cookies as $name => $value) {
                $pairs[] = $name . '=' . $value;
            }
            $headers[] = 'Cookie: ' . implode('; ', $pairs);
        }
        $context = stream_context_create(['http' => [
            'method' => $method, 'header' => implode("\r\n", $headers),
            'content' => $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
            'ignore_errors' => true, 'timeout' => 5,
        ]]);
        $raw = file_get_contents($this->baseUrl . $path, false, $context);
        verifyLibrary($raw !== false, 'Local Library API did not respond.');
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

        return [
            'status' => (int) ($match[1] ?? 0),
            'body' => $raw,
            'json' => $raw === '' ? null : json_decode($raw, true, 512, JSON_THROW_ON_ERROR),
        ];
    }

    public function csrf(): string
    {
        $response = $this->request('GET', '/api/v1/auth/csrf');
        verifyLibrary($response['status'] === 200, 'CSRF endpoint failed.');

        return $response['json']['data']['csrfToken'];
    }

    public function login(string $email, string $password): string
    {
        $token = $this->csrf();
        $response = $this->request('POST', '/api/v1/auth/login', [
            'email' => $email, 'password' => $password,
        ], $token);
        verifyLibrary($response['status'] === 200, 'Fixture login failed.');

        return $this->csrf();
    }
}

require __DIR__ . '/support/database.php';
$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
verifyLibrary($config['database'] === 'myfunlist_test'
    && in_array($config['host'], ['localhost', '127.0.0.1'], true),
    'Library tests may use only the local myfunlist_test database.');
$connection = (new Database())->connect();
verifyLibrary($connection->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'Library test connection selected the wrong database.');
foreach (['users', 'media', 'user_media'] as $table) {
    verifyLibrary((int) $connection->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn() === 0,
        'Library HTTP tests require empty local test tables.');
}

$suffix = bin2hex(random_bytes(6));
$bookId = 'book-' . $suffix;
$numberId = (string) random_int(10000000, 99999999);
$emailA = 'library-a-' . $suffix . '@example.test';
$emailB = 'library-b-' . $suffix . '@example.test';
$emailC = 'library-c-' . $suffix . '@example.test';
$password = bin2hex(random_bytes(16));
$hash = password_hash($password, PASSWORD_DEFAULT);
$insertUser = $connection->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');

$_ENV['TMDB_API_TOKEN'] = 'fixture-token';
$_ENV['RAWG_API_KEY'] = 'fixture-key';
$_ENV['GOOGLE_BOOKS_API_KEY'] = '';
$fakeHttp = new FakeProviderHttp($bookId, $numberId);
$service = new LibraryService(new Database(), new ProviderMediaResolver($fakeHttp));
$socket = null;
$process = null;
$serverLog = dirname(__DIR__) . '/var/library-test-server.log';

try {
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
    $items = [];
    verifyLibrary($service->list($userA) === [], 'An empty Library must return an empty array.');
    $defaults = ['book' => 'want-to-read', 'movie' => 'want-to-watch',
        'tv' => 'want-to-watch', 'game' => 'want-to-play'];
    foreach ($identities as $type => $identity) {
        $result = $service->add($userA, ['media' => (object) $identity]);
        $item = $result['item'];
        verifyLibrary($result['added'] === true
            && $item['media']['mediaType'] === $type
            && $item['userMedia']['status'] === $defaults[$type]
            && $item['userMedia']['rating'] === null
            && is_string($item['userMedia']['id'])
            && str_contains($item['userMedia']['addedAt'], 'T')
            && $item['userMedia']['mediaKey'] === implode(':', array_values($identity)),
            'New Library item has incorrect identity or defaults.');
        $items[$type] = $item;
    }
    verifyLibrary($items['book']['media']['authors'] === ['A. Author']
        && $items['book']['media']['publishedYear'] === '2024'
        && str_starts_with($items['book']['media']['coverImage'], 'https:'),
        'Book metadata was not normalized.');
    verifyLibrary($items['movie']['media']['releaseYear'] === '2023'
        && $items['movie']['media']['posterImage'] === 'https://image.tmdb.org/t/p/w342/poster.jpg'
        && $items['tv']['media']['firstAirYear'] === '2022'
        && $items['game']['media']['platforms'] === ['PC'],
        'Movie, TV, or game metadata was not normalized.');
    verifyLibrary($items['movie']['userMedia']['mediaKey'] !== $items['tv']['userMedia']['mediaKey'],
        'TMDB movie and TV with the same source ID must stay distinct.');
    $storedMetadata = $connection->prepare(
        'SELECT metadata FROM media WHERE source = ? AND media_type = ? AND source_id = ?',
    );
    $storedMetadata->execute(['google-books', 'book', $bookId]);
    $bookMetadata = json_decode($storedMetadata->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
    verifyLibrary($bookMetadata['authors'] === ['A. Author']
        && !array_key_exists('volumeInfo', $bookMetadata)
        && !array_key_exists('sourceId', $bookMetadata),
        'Only normalized provider-specific metadata should be stored.');

    $updatedMovie = $service->update($userA, $items['movie']['userMedia']['id'],
        ['status' => 'watched', 'rating' => 8.5]);
    $callsBeforeDuplicate = $fakeHttp->calls;
    $duplicate = $service->add($userA, ['media' => (object) $identities['movie']]);
    verifyLibrary($duplicate['added'] === false && $fakeHttp->calls === $callsBeforeDuplicate
        && $duplicate['item'] === $updatedMovie,
        'Duplicate add must preserve the existing user relationship without provider lookup.');
    $countLinks = $connection->prepare('SELECT COUNT(*) FROM user_media WHERE user_id = ? AND media_id = ?');
    $findMovieId = $connection->prepare(
        'SELECT id FROM media WHERE source = ? AND media_type = ? AND source_id = ?',
    );
    $findMovieId->execute(['tmdb', 'movie', $numberId]);
    $movieId = $findMovieId->fetchColumn();
    $countLinks->execute([$userA->id, $movieId]);
    verifyLibrary((int) $countLinks->fetchColumn() === 1,
        'Duplicate add must not create a second user_media row.');
    $shared = $service->add($userB, ['media' => (object) $identities['movie']]);
    verifyLibrary($shared['added'] === true && $fakeHttp->calls === $callsBeforeDuplicate
        && $shared['item']['userMedia']['id'] !== $updatedMovie['userMedia']['id'],
        'Second user must reuse one shared media row.');
    $countMedia = $connection->prepare(
        'SELECT COUNT(*) FROM media WHERE source = ? AND media_type = ? AND source_id = ?',
    );
    $countMedia->execute(['tmdb', 'movie', $numberId]);
    verifyLibrary((int) $countMedia->fetchColumn() === 1, 'Shared movie media row was duplicated.');
    verifyLibrary(count($service->list($userA)) === 4 && count($service->list($userB)) === 1,
        'Library listing must be scoped to the current user.');
    verifyLibrary($service->list($userB)[0]['userMedia']['mediaKey'] === 'tmdb:movie:' . $numberId,
        'A user must not see another user\'s Library entry.');

    foreach (['book' => 'finished', 'movie' => 'watched',
        'tv' => 'completed', 'game' => 'dropped'] as $type => $validStatus) {
        $entryId = $items[$type]['userMedia']['id'];
        $changed = $service->update($userA, $entryId, ['status' => $validStatus]);
        verifyLibrary($changed['userMedia']['status'] === $validStatus,
            'Valid media-specific status was rejected.');
        expectLibraryError(static fn () => $service->update($userA, $entryId, ['status' => 'invalid']), 422);
    }
    $bookEntry = $items['book']['userMedia']['id'];
    foreach ([0.5, 8.5, 10, null] as $rating) {
        $changed = $service->update($userA, $bookEntry, ['rating' => $rating]);
        verifyLibrary($changed['userMedia']['rating'] === ($rating === null ? null : (float) $rating)
            && $changed['userMedia']['status'] === 'finished',
            'Rating change must preserve status.');
    }
    foreach ([0, 10.5, 8.1, '8.5'] as $rating) {
        expectLibraryError(static fn () => $service->update($userA, $bookEntry, ['rating' => $rating]), 422);
    }
    $changedMovie = $service->update($userA, $items['movie']['userMedia']['id'],
        ['status' => 'want-to-watch']);
    verifyLibrary($changedMovie['userMedia']['rating'] === 8.5,
        'Status change must preserve the rating.');
    expectLibraryError(static fn () => $service->update($userA, $bookEntry,
        ['sourceId' => 'other']), 422);
    expectLibraryError(static fn () => $service->add($userA, ['media' => (object) [
        ...$identities['movie'], 'title' => 'Client title',
    ]]), 422);
    expectLibraryError(static fn () => $service->add($userA, ['media' => (object) [
        'source' => 'tmdb', 'mediaType' => 'book', 'sourceId' => $numberId,
    ]]), 422);
    expectLibraryError(static fn () => $service->update($userB, $bookEntry, ['rating' => 5]), 404);
    expectLibraryError(static fn () => $service->delete($userB, $bookEntry), 404);

    $fakeHttp->offline = true;
    $callsBeforeCached = $fakeHttp->calls;
    $cached = $service->add($userB, ['media' => (object) $identities['book']]);
    verifyLibrary($cached['added'] === true && $fakeHttp->calls === $callsBeforeCached,
        'Cached media must remain addable while provider is unavailable.');
    expectLibraryError(static fn () => $service->add($userA, ['media' => (object) [
        'source' => 'google-books', 'mediaType' => 'book', 'sourceId' => 'missing-' . $suffix,
    ]]), 503);
    $fakeHttp->offline = false;
    expectLibraryError(static fn () => $service->add($userA, ['media' => (object) [
        'source' => 'google-books', 'mediaType' => 'book', 'sourceId' => 'missing-' . $suffix,
    ]]), 404);
    expectLibraryError(static fn () => $service->add($userA, ['media' => (object) [
        'source' => 'google-books', 'mediaType' => 'book', 'sourceId' => 'malformed-' . $suffix,
    ]]), 502);
    $countFailed = $connection->prepare('SELECT COUNT(*) FROM media WHERE source_id IN (?, ?)');
    $countFailed->execute(['missing-' . $suffix, 'malformed-' . $suffix]);
    verifyLibrary((int) $countFailed->fetchColumn() === 0,
        'Provider failure must leave no partial media row.');

    $socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
    verifyLibrary($socket !== false, 'Could not reserve a local API port.');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $socket = null;
    $port = (int) substr(strrchr($address, ':'), 1);
    $baseUrl = 'http://127.0.0.1:' . $port;
    $environment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
        'APP_ENV' => 'testing', 'DB_DATABASE' => 'myfunlist_test',
        'TMDB_API_TOKEN' => '', 'RAWG_API_KEY' => '',
    ]);
    $process = proc_open(
        [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', 'public', 'public/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
        $pipes, dirname(__DIR__), $environment,
    );
    verifyLibrary(is_resource($process), 'Could not start local API server.');
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        if (@file_get_contents($baseUrl . '/api/v1/health') !== false) {
            $ready = true;
            break;
        }
        usleep(100000);
    }
    verifyLibrary($ready, 'Local API server did not start.');

    $anonymous = new LibraryHttpClient($baseUrl);
    verifyLibrary($anonymous->request('GET', '/api/v1/library')['status'] === 401
        && $anonymous->request('POST', '/api/v1/library', ['media' => $identities['book']])['status'] === 401,
        'Anonymous Library operations must return 401.');
    $clientA = new LibraryHttpClient($baseUrl);
    $tokenA = $clientA->login($emailA, $password);
    $clientB = new LibraryHttpClient($baseUrl);
    $tokenB = $clientB->login($emailB, $password);
    $clientC = new LibraryHttpClient($baseUrl);
    $clientC->login($emailC, $password);
    $empty = $clientC->request('GET', '/api/v1/library');
    verifyLibrary($empty['status'] === 200 && $empty['json'] === ['data' => []],
        'Empty Library HTTP response must be data: [].');
    $listA = $clientA->request('GET', '/api/v1/library');
    $listB = $clientB->request('GET', '/api/v1/library');
    verifyLibrary($listA['status'] === 200 && count($listA['json']['data']) === 4
        && $listB['status'] === 200 && count($listB['json']['data']) === 2,
        'Live HTTP Library lists must remain user-scoped.');
    $keysB = array_column(array_column($listB['json']['data'], 'userMedia'), 'mediaKey');
    verifyLibrary(!in_array('tmdb:tv:' . $numberId, $keysB, true)
        && !in_array('rawg:game:' . $numberId, $keysB, true),
        'A user must not see another user\'s entries in live HTTP listing.');
    verifyLibrary($clientA->request('POST', '/api/v1/library',
        ['media' => $identities['game']])['status'] === 403,
        'POST must require CSRF.');
    $unavailableId = (string) ((int) $numberId + 1);
    $unavailable = $clientA->request('POST', '/api/v1/library', ['media' => [
        'source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => $unavailableId,
    ]], $tokenA);
    verifyLibrary($unavailable['status'] === 503
        && $unavailable['json']['error']['code'] === 'provider_unavailable'
        && !str_contains($unavailable['body'], 'TMDB_API_TOKEN'),
        'Uncached provider failure must return a safe API error.');
    $countMedia->execute(['tmdb', 'movie', $unavailableId]);
    verifyLibrary((int) $countMedia->fetchColumn() === 0,
        'Failed live provider resolution must not create media.');
    $gameEntry = $items['game']['userMedia']['id'];
    verifyLibrary($clientB->request('PATCH', '/api/v1/library/' . $gameEntry,
        ['rating' => 7], $tokenB)['status'] === 404
        && $clientB->request('DELETE', '/api/v1/library/' . $gameEntry, null, $tokenB)['status'] === 404,
        'Foreign Library entry IDs must return 404.');
    verifyLibrary($clientA->request('PATCH', '/api/v1/library/' . $gameEntry,
        ['rating' => 7])['status'] === 403, 'PATCH must require CSRF.');
    $patched = $clientA->request('PATCH', '/api/v1/library/' . $gameEntry,
        ['rating' => 7], $tokenA);
    verifyLibrary($patched['status'] === 200
        && $patched['json']['data']['userMedia']['rating'] === 7,
        'Live PATCH must update the owned entry.');
    verifyLibrary($clientA->request('DELETE', '/api/v1/library/' . $gameEntry)['status'] === 403,
        'DELETE must require CSRF.');
    $deleted = $clientA->request('DELETE', '/api/v1/library/' . $gameEntry, null, $tokenA);
    verifyLibrary($deleted['status'] === 204 && $deleted['body'] === ''
        && $clientA->request('DELETE', '/api/v1/library/' . $gameEntry, null, $tokenA)['status'] === 404,
        'Live DELETE must remove an owned entry once.');
    $readded = $clientA->request('POST', '/api/v1/library', ['media' => $identities['game']], $tokenA);
    verifyLibrary($readded['status'] === 201 && $readded['json']['data']['added'] === true,
        'Live POST must add cached media.');
    $duplicateHttp = $clientA->request('POST', '/api/v1/library', ['media' => $identities['game']], $tokenA);
    verifyLibrary($duplicateHttp['status'] === 200 && $duplicateHttp['json']['data']['added'] === false,
        'Live duplicate POST must be idempotent.');
    verifyLibrary($clientA->request('POST', '/api/v1/auth/logout', null, $tokenA)['status'] === 204
        && $clientA->request('GET', '/api/v1/library')['status'] === 401,
        'Logout must remove access to the Library.');

    $service->delete($userA, $items['movie']['userMedia']['id']);
    expectLibraryError(static fn () => $service->delete($userA, $items['movie']['userMedia']['id']), 404);
    verifyLibrary(count($service->list($userB)) === 2, 'Deleting one user entry must retain another user entry.');
    $countMedia->execute(['tmdb', 'movie', $numberId]);
    verifyLibrary((int) $countMedia->fetchColumn() === 1, 'DELETE must retain shared media.');

    $badMetaId = 'badmeta-' . $suffix;
    $insertBad = $connection->prepare(
        'INSERT INTO media (source, media_type, source_id, title, metadata) VALUES (?, ?, ?, ?, ?)',
    );
    $insertBad->execute(['google-books', 'book', $badMetaId, 'Bad metadata fixture', '[]']);
    $badMediaId = $connection->lastInsertId();
    $connection->prepare('INSERT INTO user_media (user_id, media_id, status) VALUES (?, ?, ?)')
        ->execute([$userB->id, $badMediaId, 'want-to-read']);
    $badResponse = $clientB->request('GET', '/api/v1/library');
    verifyLibrary($badResponse['status'] === 500
        && $badResponse['json']['error']['code'] === 'internal_error'
        && !str_contains($badResponse['body'], 'metadata')
        && !str_contains($badResponse['body'], 'SQL'),
        'Invalid stored metadata must produce an opaque error.');

    echo "Library service and HTTP tests passed.\n";
} finally {
    if (is_resource($socket)) {
        fclose($socket);
    }
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
    @unlink($serverLog);
    $deleteUsers = $connection->prepare('DELETE FROM users WHERE email IN (?, ?, ?)');
    $deleteUsers->execute([$emailA, $emailB, $emailC]);
    $deleteMedia = $connection->prepare('DELETE FROM media WHERE source_id IN (?, ?, ?, ?, ?)');
    $deleteMedia->execute([$bookId, $numberId, 'missing-' . $suffix,
        'malformed-' . $suffix, 'badmeta-' . $suffix]);
}
