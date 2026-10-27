<?php

declare(strict_types=1);

use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use MyFunList\Http\Application;
use MyFunList\Http\Controllers\MediaController;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Router;
use MyFunList\Library\LibraryService;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;

require dirname(__DIR__) . '/vendor/autoload.php';

$checks = 0;
function verifyMediaApi(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}

function mediaError(Application $app, string $method, string $path, int $status, string $code): JsonResponse
{
    $response = $app->handle($method, $path);
    $body = json_decode($response->body(), true, 512, JSON_THROW_ON_ERROR);
    verifyMediaApi($response->status === $status && $body['error']['code'] === $code,
        'Unexpected media API status/category for a fixture request.');
    verifyMediaApi(!str_contains($response->body(), 'fixture-secret')
        && !str_contains($response->body(), 'https://provider.test'), 'Media API exposed upstream information.');
    return $response;
}

final class MediaApiHttp implements ProviderHttpClient
{
    public int $calls = 0;
    public string $mode = 'success';
    public int $failureStatus = 503;

    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        if ($this->mode === 'failure') {
            throw new ProviderException($this->failureStatus, 'unsafe', 'https://provider.test/?key=fixture-secret');
        }
        if ($this->mode === 'malformed') return ['id' => 'mismatch', 'title' => 'Invalid'];
        $path = parse_url($url, PHP_URL_PATH);
        $id = substr($path, strrpos($path, '/') + 1);
        $private = ['userMedia' => ['rating' => 10, 'status' => 'watched'], 'lists' => ['private'],
            'currentUser' => ['id' => 'secret-user'], 'providerUrl' => $url];
        if (str_contains($path, '/volumes/')) {
            return ['id' => $id, 'volumeInfo' => ['title' => 'Book', 'categories' => ['Fiction']], ...$private];
        }
        if (str_contains($path, '/movie/')) return ['id' => $id, 'title' => 'Movie', 'runtime' => 120, ...$private];
        if (str_contains($path, '/tv/')) return ['id' => $id, 'name' => 'Show', 'number_of_seasons' => 3, ...$private];
        return ['id' => $id, 'name' => 'Game', 'developers' => [['name' => 'Studio']], ...$private];
    }
}

$originalEnvironment = $_ENV;
$originalServer = $_SERVER;
$originalSession = $_SESSION ?? null;
$http = new MediaApiHttp();
$controller = new MediaController(new ProviderMediaResolver($http));
$router = new Router();
$identities = ['book' => ['google-books', 'Ab_9-x'], 'movie' => ['tmdb', '42'],
    'tv' => ['tmdb', '42'], 'game' => ['rawg', '62']];
foreach ($identities as $type => [$source]) {
    $router->add('GET', '/api/v1/media/' . $type . '/' . $source . '/{sourceId}',
        static fn (string $id): JsonResponse => $controller->show($type, $source, $id),
        ['sourceId' => static fn (string $id): bool => MediaRules::isValidSourceId($source, $id)]);
}
$app = new Application($router);

try {
    $_ENV['TMDB_API_TOKEN'] = $_ENV['RAWG_API_KEY'] = $_ENV['GOOGLE_BOOKS_API_KEY'] = 'fixture-secret';
    unset($_SERVER['HTTP_COOKIE'], $_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['HTTP_AUTHORIZATION'], $_SESSION);
    foreach ($identities as $type => [$source, $id]) {
        $before = $http->calls;
        $response = $app->handle('GET', '/api/v1/media/' . $type . '/' . $source . '/' . $id);
        $payload = json_decode($response->body(), false, 512, JSON_THROW_ON_ERROR);
        $detail = $payload->data;
        verifyMediaApi($response->status === 200 && $http->calls === $before + 1,
            'Anonymous detail requests should return normalized media with one provider call.');
        verifyMediaApi(array_keys(get_object_vars($payload)) === ['data'] && $detail->source === $source
            && $detail->mediaType === $type && $detail->sourceId === $id && $detail->details instanceof stdClass,
            'Successful detail responses must preserve the normalized envelope and identity.');
        verifyMediaApi(array_intersect(['userMedia', 'lists', 'currentUser', 'providerUrl'], array_keys(get_object_vars($detail))) === []
            && !str_contains($response->body(), 'fixture-secret') && session_status() === PHP_SESSION_NONE,
            'Detail responses must not expose personal state, credentials, or open a session.');
        verifyMediaApi(match ($type) {
            'book' => $detail->genres === ['Fiction'] && (array) $detail->details === [],
            'movie' => $detail->details->runtimeMinutes === 120,
            'tv' => $detail->details->numberOfSeasons === 3,
            'game' => $detail->details->developers === ['Studio'],
        }, 'Type-specific normalized detail metadata was lost at the API boundary.');
        mediaError($app, 'POST', '/api/v1/media/' . $type . '/' . $source . '/' . $id, 405, 'method_not_allowed');
    }
    foreach (['A', '0', '_', '-', 'aZ09_-', str_repeat('a', 191)] as $id) {
        verifyMediaApi($app->handle('GET', '/api/v1/media/book/google-books/' . $id)->status === 200,
            'Valid Google Books IDs must support all allowed characters and length.');
    }
    foreach (['1', '12345678901234567890'] as $id) {
        foreach (['movie/tmdb', 'tv/tmdb', 'game/rawg'] as $prefix) {
            verifyMediaApi($app->handle('GET', '/api/v1/media/' . $prefix . '/' . $id)->status === 200,
                'Valid numeric source IDs must remain strings without integer overflow.');
        }
    }

    $before = $http->calls;
    foreach (['', '.', '..', '../other', 'a/b', 'a\\b', 'a b', 'a+b', 'a.b', 'a?b', 'a#b',
        'a%2Fb', 'a%2fb', 'a%5Cb', '%2e%2e', '%252F', '%00', "bad\0id", 'é', '{sourceId}',
        str_repeat('x', 192)] as $id) {
        foreach (['GET', 'POST'] as $method) {
            mediaError($app, $method, '/api/v1/media/book/google-books/' . $id, 404, 'not_found');
        }
    }
    foreach (['0', '-1', '01', '1.5', '1e3', '+1', 'Ab_9-x', str_repeat('1', 21), '%31', '1%2F2'] as $id) {
        foreach (['movie/tmdb', 'tv/tmdb', 'game/rawg'] as $prefix) {
            foreach (['GET', 'DELETE'] as $method) {
                mediaError($app, $method, '/api/v1/media/' . $prefix . '/' . $id, 404, 'not_found');
            }
        }
    }
    foreach (['book/tmdb/42', 'movie/rawg/42', 'tv/google-books/42', 'game/tmdb/42',
        'anime/tmdb/42', 'book/unknown/42', 'movie/TMDB/42', '../tmdb/42'] as $suffix) {
        mediaError($app, 'GET', '/api/v1/media/' . $suffix, 404, 'not_found');
        mediaError($app, 'POST', '/api/v1/media/' . $suffix, 404, 'not_found');
    }
    verifyMediaApi($http->calls === $before, 'Invalid identities and methods must never contact providers.');
    foreach ([['book', 'tmdb', '42'], ['book', 'google-books', '../bad'], ['movie', 'tmdb', '0']] as $identity) {
        try {
            $controller->show(...$identity);
        } catch (ApiException $exception) {
            verifyMediaApi($exception->status === 404, 'Direct controller calls must also validate identity.');
            continue;
        }
        throw new RuntimeException('Controller accepted an invalid identity.');
    }
    verifyMediaApi($http->calls === $before, 'Controller validation must precede provider access.');

    foreach ([404 => [404, 'media_not_found'], 429 => [503, 'provider_unavailable'],
        500 => [503, 'provider_unavailable'], 503 => [503, 'provider_unavailable'],
        401 => [503, 'provider_unavailable'], 403 => [503, 'provider_unavailable'],
        502 => [502, 'provider_error']] as $upstream => [$status, $code]) {
        $http->mode = 'failure';
        $http->failureStatus = $upstream;
        mediaError($app, 'GET', '/api/v1/media/movie/tmdb/42', $status, $code);
    }
    $http->mode = 'malformed';
    foreach ($identities as $type => [$source, $id]) {
        mediaError($app, 'GET', '/api/v1/media/' . $type . '/' . $source . '/' . $id, 502, 'provider_error');
    }
    $http->mode = 'success';
    foreach (['movie/tmdb/42' => 'TMDB_API_TOKEN', 'game/rawg/62' => 'RAWG_API_KEY'] as $suffix => $key) {
        $_ENV[$key] = '';
        $before = $http->calls;
        mediaError($app, 'GET', '/api/v1/media/' . $suffix, 503, 'provider_unavailable');
        verifyMediaApi($http->calls === $before, 'Missing provider credentials must fail before upstream access.');
        $_ENV[$key] = 'fixture-secret';
    }

    // Deze controles hebben geen database nodig: alleen de bestaande Library-invoervalidatie draait.
    foreach ($identities as $type => [$source, $id]) {
        verifyMediaApi(LibraryService::validateIdentity(['media' => (object) [
            'source' => $source, 'mediaType' => $type, 'sourceId' => ' ' . $id . ' ',
        ]]) === [$source, $type, $id], 'Library identity validation must retain trimming and supported identities.');
    }
    foreach ([[], ['media' => []], ['media' => (object) ['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => 42]],
        ['media' => (object) ['source' => 'tmdb', 'mediaType' => 'movie', 'sourceId' => '0']],
        ['media' => (object) ['source' => 'google-books', 'mediaType' => 'movie', 'sourceId' => '42']],
        ['media' => (object) ['source' => 'rawg', 'mediaType' => 'game', 'sourceId' => '42', 'title' => 'Untrusted']],
        ['media' => (object) ['source' => 'rawg', 'mediaType' => 'game', 'sourceId' => '42'], 'status' => 'playing']] as $input) {
        try {
            LibraryService::validateIdentity($input);
        } catch (ApiException $exception) {
            verifyMediaApi($exception->status === 422 && $exception->errorCode === 'validation_error',
                'Library body validation must retain its existing 422 behavior.');
            continue;
        }
        throw new RuntimeException('Library accepted an invalid identity body.');
    }

    // Controleer ook de echte bootstrap; ongeldige paden mogen niet bij database of provider komen.
    $_ENV['DB_PORT'] = 'invalid';
    $realApp = require dirname(__DIR__) . '/config/bootstrap.php';
    foreach ($identities as $type => [$source, $id]) {
        mediaError($realApp, 'POST', '/api/v1/media/' . $type . '/' . $source . '/' . $id, 405, 'method_not_allowed');
    }
    foreach (['book/google-books/%2F', 'book/google-books/{sourceId}', 'movie/tmdb/zero', 'book/tmdb/42'] as $suffix) {
        mediaError($realApp, 'GET', '/api/v1/media/' . $suffix, 404, 'not_found');
    }
    echo 'Media API checks passed (', $checks, " assertions; no provider requests or database connections).\n";
} finally {
    $_ENV = $originalEnvironment;
    $_SERVER = $originalServer;
    if ($originalSession === null) unset($_SESSION);
    else $_SESSION = $originalSession;
}
