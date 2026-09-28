<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Infrastructure\Database;

require dirname(__DIR__) . '/config/environment.php';

final class ListsHttpClient
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
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
            'ignore_errors' => true,
            'timeout' => 5,
        ]]);
        $response = file_get_contents($this->baseUrl . $path, false, $context);
        if ($response === false) {
            throw new RuntimeException('Local lists API did not respond.');
        }
        $status = (int) (preg_match('/^HTTP\/\S+ (\d{3})/', $http_response_header[0], $match)
            ? $match[1] : 0);
        foreach ($http_response_header as $header) {
            if (stripos($header, 'Set-Cookie: ') !== 0) {
                continue;
            }
            [$name, $value] = array_pad(explode('=', explode(';', substr($header, 12))[0], 2), 2, '');
            if ($value === '') {
                unset($this->cookies[$name]);
            } else {
                $this->cookies[$name] = $value;
            }
        }

        return [
            'status' => $status,
            'body' => $response,
            'json' => $response === '' ? null : json_decode($response, true, 512, JSON_THROW_ON_ERROR),
        ];
    }
}

function verifyLists(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function token(ListsHttpClient $client): string
{
    $response = $client->request('GET', '/api/v1/auth/csrf');
    $token = $response['json']['data']['csrfToken'] ?? null;
    verifyLists($response['status'] === 200 && is_string($token), 'CSRF token was not issued.');

    return $token;
}

$_ENV['APP_ENV'] = 'testing';
$_ENV['DB_DATABASE'] = 'myfunlist_test';
$config = Config::database();
verifyLists($config['database'] === 'myfunlist_test'
    && in_array($config['host'], ['127.0.0.1', 'localhost'], true),
    'Lists tests may use only the local test database.');
$database = (new Database())->connect();
verifyLists($database->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'Lists tests selected the wrong database.');

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
verifyLists($socket !== false, 'Could not reserve a local API port.');
$address = stream_socket_get_name($socket, false);
fclose($socket);
$port = (int) substr(strrchr($address, ':'), 1);
$baseUrl = 'http://127.0.0.1:' . $port;
$serverLog = dirname(__DIR__) . '/var/lists-test-server.log';
if (!is_dir(dirname($serverLog))) {
    mkdir(dirname($serverLog), 0700, true);
}
$environment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
    'APP_ENV' => 'testing', 'DB_DATABASE' => 'myfunlist_test',
]);
$process = proc_open(
    [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', 'public', 'public/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
    $pipes,
    dirname(__DIR__),
    $environment,
);
verifyLists(is_resource($process), 'Could not start lists API server.');
fclose($pipes[0]);

$suffix = bin2hex(random_bytes(8));
$emails = ['lists-a-' . $suffix . '@example.test', 'lists-b-' . $suffix . '@example.test'];
$mediaIds = [];
try {
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        if (@file_get_contents($baseUrl . '/api/v1/health') !== false) {
            $ready = true;
            break;
        }
        usleep(100000);
    }
    verifyLists($ready, 'Lists API server did not start.');

    $anonymous = new ListsHttpClient($baseUrl);
    foreach (['/api/v1/lists', '/api/v1/lists/1'] as $path) {
        verifyLists($anonymous->request('GET', $path)['status'] === 401,
            'Anonymous list GET must return 401.');
    }
    verifyLists($anonymous->request('POST', '/api/v1/lists', ['title' => 'No'])['status'] === 401,
        'Anonymous list mutation must return 401.');

    $clients = [new ListsHttpClient($baseUrl), new ListsHttpClient($baseUrl)];
    $users = [];
    $tokens = [];
    foreach ($clients as $index => $client) {
        $initialToken = token($client);
        $registered = $client->request('POST', '/api/v1/auth/register', [
            'email' => $emails[$index], 'password' => bin2hex(random_bytes(16)),
        ], $initialToken);
        verifyLists($registered['status'] === 201, 'Test account registration failed.');
        $users[] = $registered['json']['data']['user']['id'];
        $tokens[] = token($client);
    }
    [$a, $b] = $clients;
    [$aToken, $bToken] = $tokens;
    verifyLists($a->request('POST', '/api/v1/lists', ['title' => 'Missing token'])['status'] === 403,
        'List creation must require CSRF.');
    verifyLists($a->request('POST', '/api/v1/lists', [], $aToken)['status'] === 400,
        'A JSON array is not a list request object.');
    foreach ([['title' => '   '], ['title' => "Bad\nTitle"], ['title' => str_repeat('a', 121)],
        ['title' => 'Valid', 'description' => str_repeat('b', 1001)],
        ['title' => 'Valid', 'userId' => $users[1]]] as $invalid) {
        verifyLists($a->request('POST', '/api/v1/lists', $invalid, $aToken)['status'] === 422,
            'Invalid list payload must return 422.');
    }

    $created = $a->request('POST', '/api/v1/lists', [
        'title' => '  Favorites  ', 'description' => '  Mixed favorites  ',
    ], $aToken);
    $list = $created['json']['data'] ?? null;
    verifyLists($created['status'] === 201 && is_string($list['id'] ?? null)
        && $list['title'] === 'Favorites' && $list['description'] === 'Mixed favorites'
        && $list['itemCount'] === 0 && str_ends_with($list['createdAt'], 'Z'),
        'List creation must return canonical metadata.');
    $listId = $list['id'];
    $duplicateTitle = $a->request('POST', '/api/v1/lists', ['title' => 'Favorites'], $aToken);
    verifyLists($duplicateTitle['status'] === 201
        && $duplicateTitle['json']['data']['description'] === null,
        'Duplicate titles and nullable descriptions must be allowed.');
    $secondListId = $duplicateTitle['json']['data']['id'];
    $otherList = $b->request('POST', '/api/v1/lists', ['title' => 'Private B'], $bToken);
    $otherListId = $otherList['json']['data']['id'];
    verifyLists(count($a->request('GET', '/api/v1/lists')['json']['data']) === 2
        && count($b->request('GET', '/api/v1/lists')['json']['data']) === 1,
        'Each user must see only their own list summaries.');
    foreach ([
        ['GET', '/api/v1/lists/' . $listId, null],
        ['PATCH', '/api/v1/lists/' . $listId, ['title' => 'No']],
        ['DELETE', '/api/v1/lists/' . $listId, null],
        ['POST', '/api/v1/lists/' . $listId . '/items', ['userMediaId' => '1']],
        ['DELETE', '/api/v1/lists/' . $listId . '/items/1', null],
    ] as [$method, $path, $body]) {
        verifyLists($anonymous->request($method, $path, $body)['status'] === 401,
            'Every private list operation must require authentication.');
    }

    foreach (['GET', 'PATCH', 'DELETE'] as $method) {
        $result = $b->request($method, '/api/v1/lists/' . $listId,
            $method === 'PATCH' ? ['title' => 'Attack'] : null, $bToken);
        verifyLists($result['status'] === 404, 'Unowned list must be hidden for ' . $method . '.');
    }
    verifyLists($b->request('GET', '/api/v1/lists/999999999999')['status'] === 404,
        'Missing and unowned lists must both return 404.');
    verifyLists($b->request('POST', '/api/v1/lists/' . $listId . '/items',
        ['userMediaId' => '1'], $bToken)['status'] === 404,
        'User B cannot add to A list.');
    verifyLists($b->request('DELETE', '/api/v1/lists/' . $listId . '/items/1',
        null, $bToken)['status'] === 404,
        'User B cannot remove from A list.');

    $insertMedia = $database->prepare(
        'INSERT INTO media (source, media_type, source_id, title, metadata) VALUES (?, ?, ?, ?, ?)',
    );
    $insertEntry = $database->prepare(
        'INSERT INTO user_media (user_id, media_id, status, rating) VALUES (?, ?, ?, ?)',
    );
    $fixtures = [
        ['google-books', 'book', 'Book', ['authors' => ['Writer']], 'reading', 8.0],
        ['tmdb', 'movie', 'Movie', ['releaseYear' => '2025'], 'watched', 9.0],
        ['tmdb', 'tv', 'Show', ['firstAirYear' => '2024'], 'watching', null],
        ['rawg', 'game', 'Game', ['platforms' => ['PC']], 'playing', 7.5],
    ];
    $entryIds = [];
    foreach ($fixtures as $index => [$source, $type, $title, $metadata, $status, $rating]) {
        $sourceId = $source === 'google-books' ? 'fixture-' . $suffix : (string) (100000000 + hexdec(substr($suffix, 0, 6)) + $index);
        $insertMedia->execute([$source, $type, $sourceId, $title,
            json_encode((object) $metadata, JSON_THROW_ON_ERROR)]);
        $mediaId = $database->lastInsertId();
        $mediaIds[] = $mediaId;
        $insertEntry->execute([$users[0], $mediaId, $status, $rating]);
        $entryIds[$type] = $database->lastInsertId();
    }
    $insertEntry->execute([$users[1], $mediaIds[0], 'want-to-read', null]);
    $bEntryId = $database->lastInsertId();
    verifyLists($a->request('POST', '/api/v1/lists/' . $listId . '/items',
        ['userMediaId' => $bEntryId], $aToken)['status'] === 404,
        'User A cannot add B Library entry.');
    verifyLists($b->request('POST', '/api/v1/lists/' . $otherListId . '/items',
        ['userMediaId' => $entryIds['book']], $bToken)['status'] === 404,
        'User B cannot add A Library entry.');

    $itemsPath = '/api/v1/lists/' . $listId . '/items';
    verifyLists($a->request('POST', $itemsPath, ['userMediaId' => $entryIds['book']])['status'] === 403,
        'List item add must require CSRF.');
    usleep(2000);
    foreach ($entryIds as $entryId) {
        $added = $a->request('POST', $itemsPath, ['userMediaId' => $entryId], $aToken);
        verifyLists($added['status'] === 201 && $added['json']['data']['added'] === true,
            'Own mixed Library entries must be addable.');
    }
    verifyLists($a->request('POST', '/api/v1/lists/' . $secondListId . '/items',
        ['userMediaId' => $entryIds['book']], $aToken)['status'] === 201,
        'One Library entry may belong to multiple lists.');
    $duplicate = $a->request('POST', $itemsPath, ['userMediaId' => $entryIds['book']], $aToken);
    verifyLists($duplicate['status'] === 200 && $duplicate['json']['data']['added'] === false,
        'Duplicate add must be idempotent.');
    $detail = $a->request('GET', '/api/v1/lists/' . $listId);
    $items = $detail['json']['data']['items'] ?? null;
    verifyLists($detail['status'] === 200 && count($items) === 4
        && $detail['json']['data']['list']['itemCount'] === 4
        && $detail['json']['data']['list']['updatedAt'] > $list['updatedAt'],
        'List detail must contain four items and accurate count.');
    $types = array_column(array_column($items, 'media'), 'mediaType');
    sort($types);
    verifyLists($types === ['book', 'game', 'movie', 'tv'], 'Mixed media types must be preserved.');
    foreach ($items as $item) {
        verifyLists(is_string($item['userMedia']['id'])
            && is_string($item['listItem']['addedAt'])
            && !array_key_exists('password_hash', $item),
            'List items must reuse safe Library shape with list timestamp.');
    }

    $updatedLibrary = $a->request('PATCH', '/api/v1/library/' . $entryIds['movie'],
        ['status' => 'want-to-watch', 'rating' => 6.5], $aToken);
    verifyLists($updatedLibrary['status'] === 200, 'Library update must still work.');
    $detail = $a->request('GET', '/api/v1/lists/' . $listId)['json']['data'];
    $movies = array_values(array_filter($detail['items'],
        static fn (array $item): bool => $item['media']['mediaType'] === 'movie'));
    verifyLists($movies[0]['userMedia']['status'] === 'want-to-watch'
        && $movies[0]['userMedia']['rating'] === 6.5,
        'List detail must reflect live Library status and rating.');

    $bookPath = $itemsPath . '/' . $entryIds['book'];
    verifyLists($a->request('DELETE', $bookPath)['status'] === 403,
        'List item removal must require CSRF.');
    verifyLists($a->request('DELETE', $bookPath, null, $aToken)['status'] === 204,
        'Removing list membership must return 204.');
    verifyLists($a->request('DELETE', $bookPath, null, $aToken)['status'] === 404,
        'Repeated list item removal must return 404.');
    verifyLists(count($a->request('GET', '/api/v1/library')['json']['data']) === 4,
        'Removing list membership must leave Library unchanged.');
    verifyLists($a->request('DELETE', '/api/v1/library/' . $entryIds['game'], null, $aToken)['status'] === 204,
        'Library removal must still work.');
    $afterLibraryRemoval = $a->request('GET', '/api/v1/lists/' . $listId)['json']['data'];
    verifyLists($afterLibraryRemoval['list']['itemCount'] === 2
        && count($afterLibraryRemoval['items']) === 2,
        'Library removal must cascade only the relevant list membership.');

    verifyLists($a->request('PATCH', '/api/v1/lists/' . $listId,
        ['title' => 'No token'])['status'] === 403, 'List edit must require CSRF.');
    foreach ([['title' => ' '], ['description' => str_repeat('x', 1001)],
        ['itemCount' => 20]] as $invalid) {
        verifyLists($a->request('PATCH', '/api/v1/lists/' . $listId, $invalid, $aToken)['status'] === 422,
            'Invalid list edit must return 422.');
    }
    $edited = $a->request('PATCH', '/api/v1/lists/' . $listId,
        ['title' => '  Nieuw 李  ', 'description' => ''], $aToken);
    verifyLists($edited['status'] === 200 && $edited['json']['data']['title'] === 'Nieuw 李'
        && $edited['json']['data']['description'] === null,
        'List edit must trim Unicode title and normalize empty description.');
    verifyLists($a->request('DELETE', '/api/v1/lists/' . $listId)['status'] === 403,
        'List delete must require CSRF.');
    verifyLists($a->request('DELETE', '/api/v1/lists/' . $listId, null, $aToken)['status'] === 204,
        'List deletion must return 204.');
    verifyLists($a->request('GET', '/api/v1/lists/' . $listId)['status'] === 404
        && count($a->request('GET', '/api/v1/library')['json']['data']) === 3,
        'Deleting list must not delete Library entries.');

    echo "Custom Lists HTTP checks passed.\n";
} finally {
    if ($emails !== []) {
        $placeholders = implode(', ', array_fill(0, count($emails), '?'));
        $database->prepare('DELETE FROM users WHERE email IN (' . $placeholders . ')')->execute($emails);
    }
    foreach ($mediaIds as $mediaId) {
        $database->prepare('DELETE FROM media WHERE id = ?')->execute([$mediaId]);
    }
    proc_terminate($process);
    proc_close($process);
    @unlink($serverLog);
}
