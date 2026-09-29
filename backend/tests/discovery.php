<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Http\Controllers\DiscoverController;
use MyFunList\Http\Router;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;

require dirname(__DIR__) . '/config/environment.php';

function verifyDiscovery(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class DiscoveryProviderHttp implements ProviderHttpClient
{
    public string $mode = 'success';
    public string $lastUrl = '';
    public array $lastHeaders = [];
    public int $calls = 0;

    public function get(string $url, array $headers = []): array
    {
        $this->calls++;
        $this->lastUrl = $url;
        $this->lastHeaders = $headers;
        if ($this->mode === 'failure') {
            throw new ProviderException(503, 'provider_unavailable', 'secret fixture-token fixture-key');
        }
        if ($this->mode === 'malformed') {
            return ['results' => 'invalid'];
        }
        if ($this->mode === 'empty') {
            return ['results' => []];
        }
        if ($this->mode === 'oversized') {
            return ['results' => array_map(static fn (int $id): array => [
                'id' => $id, 'title' => 'Movie', 'name' => 'Show or game',
            ], range(1, 30))];
        }
        if ($this->mode === 'mixed') {
            return ['results' => [null, ['id' => '../bad'], ['id' => 3],
                ['id' => 4, 'title' => 'Valid', 'name' => 'Valid']]];
        }

        $path = parse_url($url, PHP_URL_PATH);
        if ($path === '/3/search/movie') {
            return ['results' => [
                ['id' => 42, 'title' => 'The Matrix', 'original_title' => 'The Matrix',
                    'release_date' => '1999-03-31', 'poster_path' => '/matrix.jpg',
                    'backdrop_path' => '/matrix-back.jpg', 'overview' => 'Movie description',
                    'original_language' => 'en', 'vote_average' => 9.1],
                ['id' => 43, 'title' => 'Movie without artwork'],
            ]];
        }
        if ($path === '/3/search/tv') {
            return ['results' => [
                ['id' => 52, 'name' => 'Breaking Bad', 'first_air_date' => '2008-01-20',
                    'poster_path' => '/show.jpg', 'overview' => 'Show description'],
                ['id' => 53, 'name' => 'Show without artwork'],
            ]];
        }
        if ($path === '/api/games') {
            return ['results' => [
                ['id' => 62, 'name' => 'Portal', 'released' => '2007-10-10',
                    'background_image' => 'https://example.test/portal.jpg',
                    'platforms' => [['platform' => ['name' => 'PC']]], 'rating' => 5],
                ['id' => 63, 'name' => 'Game without artwork', 'background_image' => 'http://example.test/insecure.jpg'],
            ]];
        }
        throw new RuntimeException('Unexpected provider URL.');
    }
}

$originalTmdb = $_ENV['TMDB_API_TOKEN'] ?? null;
$originalRawg = $_ENV['RAWG_API_KEY'] ?? null;
$originalGet = $_GET;
$_ENV['TMDB_API_TOKEN'] = 'fixture-token';
$_ENV['RAWG_API_KEY'] = 'fixture-key';
$http = new DiscoveryProviderHttp();
$controller = new DiscoverController(new ProviderMediaResolver($http));
$router = new Router();
foreach (['movie', 'tv', 'game'] as $type) {
    $router->add('GET', '/api/v1/discover/' . $type,
        static fn () => $controller->search($type, $_GET));
}
$application = new Application($router);

try {
    foreach (['movie' => 'The Matrix', 'tv' => 'Breaking Bad', 'game' => 'Portal'] as $type => $query) {
        $_GET = ['q' => '  ' . $query . '  '];
        $response = $application->handle('GET', '/api/v1/discover/' . $type);
        $body = json_decode($response->body(), true, 512, JSON_THROW_ON_ERROR);
        verifyDiscovery($response->status === 200 && count($body['data']) === 2,
            'Search should return two normalized results for ' . $type . '.');
        $first = $body['data'][0];
        $second = $body['data'][1];
        verifyDiscovery($first['source'] === ($type === 'game' ? 'rawg' : 'tmdb')
            && $first['mediaType'] === $type && is_string($first['sourceId'])
            && $first['title'] === $query && !isset($first['rating']),
            'Search identity, title, or private-rating boundary changed.');
        $parameters = [];
        parse_str((string) parse_url($http->lastUrl, PHP_URL_QUERY), $parameters);
        verifyDiscovery($parameters[$type === 'game' ? 'search' : 'query'] === $query
            && str_starts_with($http->lastUrl, 'https://')
            && ($type !== 'game' || $parameters['page_size'] === '20'),
            'Provider query should be trimmed, encoded, HTTPS, and bounded.');
        if ($type === 'game') {
            verifyDiscovery($parameters['key'] === 'fixture-key' && $http->lastHeaders === []
                && $first['coverImage'] === 'https://example.test/portal.jpg'
                && $first['platforms'] === ['PC'] && $second['coverImage'] === null
                && $second['releaseDate'] === null && $second['platforms'] === [],
                'Game search must reuse safe RAWG normalization.');
        } else {
            verifyDiscovery($http->lastHeaders === ['Authorization: Bearer fixture-token']
                && !str_contains($http->lastUrl, 'fixture-token')
                && $first['posterImage'] === 'https://image.tmdb.org/t/p/w342/'
                    . ($type === 'movie' ? 'matrix.jpg' : 'show.jpg')
                && $second['posterImage'] === null && $second['description'] === null,
                'TMDB search must use server header and safe shared normalization.');
            verifyDiscovery($first[$type === 'movie' ? 'releaseYear' : 'firstAirYear']
                === ($type === 'movie' ? '1999' : '2008')
                && $second[$type === 'movie' ? 'releaseYear' : 'firstAirYear'] === null,
                'TMDB dates and partial results should normalize correctly.');
        }

        $http->mode = 'empty';
        $empty = $application->handle('GET', '/api/v1/discover/' . $type);
        verifyDiscovery($empty->status === 200 && $empty->body() === '{"data":[]}',
            'No results must be a successful empty array.');
        $http->mode = 'success';

        $http->mode = 'oversized';
        $bounded = $application->handle('GET', '/api/v1/discover/' . $type);
        verifyDiscovery($bounded->status === 200
            && count(json_decode($bounded->body(), true)['data']) === 20,
            'Every provider must cap results even when upstream ignores the page limit.');
        $http->mode = 'mixed';
        $mixed = $application->handle('GET', '/api/v1/discover/' . $type);
        verifyDiscovery($mixed->status === 200
            && array_column(json_decode($mixed->body(), true)['data'], 'sourceId') === ['4'],
            'Malformed items must be skipped while preserving valid results.');
        $http->mode = 'success';
    }

    $_GET = ['q' => 'A&B?=C'];
    verifyDiscovery($application->handle('GET', '/api/v1/discover/movie')->status === 200,
        'Reserved query characters should remain valid search text.');
    $encodedParameters = [];
    parse_str((string) parse_url($http->lastUrl, PHP_URL_QUERY), $encodedParameters);
    verifyDiscovery($encodedParameters['query'] === 'A&B?=C'
        && !array_key_exists('B?', $encodedParameters),
        'Search text must not inject provider query parameters.');

    $callsBeforeValidation = $http->calls;
    foreach ([[], ['q' => ''], ['q' => '   '], ['q' => str_repeat('a', 201)],
        ['q' => ['array']], ['q' => 'valid', 'page' => '2'], ['q' => "line\nbreak"]] as $query) {
        $_GET = $query;
        $response = $application->handle('GET', '/api/v1/discover/movie');
        $error = json_decode($response->body(), true, 512, JSON_THROW_ON_ERROR)['error'];
        verifyDiscovery($response->status === 422 && $error['code'] === 'validation_error'
            && isset($error['fields']['q']), 'Invalid query must return the normal validation envelope.');
    }
    verifyDiscovery($http->calls === $callsBeforeValidation, 'Invalid queries must not reach providers.');
    verifyDiscovery($application->handle('GET', '/api/v1/discover/book')->status === 404,
        'Unsupported media type must return 404.');
    verifyDiscovery($application->handle('POST', '/api/v1/discover/movie')->status === 405,
        'Discovery supports only GET.');

    $_GET = ['q' => 'secret'];
    $http->mode = 'failure';
    $failure = $application->handle('GET', '/api/v1/discover/movie');
    verifyDiscovery($failure->status === 503 && !str_contains($failure->body(), 'fixture-token')
        && !str_contains($failure->body(), 'fixture-key')
        && json_decode($failure->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code']
            === 'provider_unavailable', 'Provider failure must not expose credentials.');
    $http->mode = 'malformed';
    $malformed = $application->handle('GET', '/api/v1/discover/movie');
    verifyDiscovery($malformed->status === 502
        && json_decode($malformed->body(), true, 512, JSON_THROW_ON_ERROR)['error']['code']
            === 'provider_error', 'Malformed upstream results must return a safe 502.');

    $_ENV['TMDB_API_TOKEN'] = '';
    $callsBeforeMissing = $http->calls;
    $missing = $application->handle('GET', '/api/v1/discover/movie');
    verifyDiscovery($missing->status === 503 && $http->calls === $callsBeforeMissing,
        'Missing provider configuration should fail safely without an upstream call.');

    echo "Discovery provider and API tests passed.\n";
} finally {
    $_GET = $originalGet;
    if ($originalTmdb === null) {
        unset($_ENV['TMDB_API_TOKEN']);
    } else {
        $_ENV['TMDB_API_TOKEN'] = $originalTmdb;
    }
    if ($originalRawg === null) {
        unset($_ENV['RAWG_API_KEY']);
    } else {
        $_ENV['RAWG_API_KEY'] = $originalRawg;
    }
}
