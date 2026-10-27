<?php

declare(strict_types=1);

use MyFunList\Provider\MediaDetailResolver;
use MyFunList\Provider\MediaResolver;
use MyFunList\Provider\MediaSearcher;
use MyFunList\Provider\ProviderException;
use MyFunList\Provider\ProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;

require dirname(__DIR__) . '/vendor/autoload.php';

$checks = 0;
function verifyDetail(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectDetailError(callable $operation, int $status = 502, string $code = 'provider_error'): void
{
    try {
        $operation();
    } catch (ProviderException $exception) {
        verifyDetail($exception->status === $status && $exception->errorCode === $code,
            'Provider errors must retain the safe status and category.');
        verifyDetail(!str_contains($exception->getMessage(), 'fixture-secret')
            && !str_contains($exception->getMessage(), 'https://'), 'Provider failure leaked upstream information.');
        return;
    }
    throw new RuntimeException('Expected a safe provider failure.');
}

final class DetailProviderHttp implements ProviderHttpClient
{
    public array $response = [];
    public array $calls = [];
    public ?ProviderException $failure = null;

    public function get(string $url, array $headers = []): array
    {
        $this->calls[] = ['url' => $url, 'headers' => $headers];
        if ($this->failure !== null) {
            throw $this->failure;
        }
        return $this->response;
    }
}

$identities = [
    'book' => ['google-books', 'book', 'book_1-X'],
    'movie' => ['tmdb', 'movie', '42'],
    'tv' => ['tmdb', 'tv', '42'],
    'game' => ['rawg', 'game', '62'],
];
$fixtures = [
    'book' => ['id' => 'book_1-X', 'volumeInfo' => [
        'title' => '  Fixture Book  ', 'authors' => [' A. Author ', 'B. Writer'],
        'publisher' => 'Example Press', 'pageCount' => 320, 'publishedDate' => '1997-06', 'language' => 'en',
        'industryIdentifiers' => [
            ['type' => 'ISBN_10', 'identifier' => '0306406152'],
            ['type' => 'ISBN_13', 'identifier' => '9780306406157'],
        ],
        'categories' => [' Fiction ', 'Adventure', 'Fiction'],
        'description' => '<p>A <b>book</b> &amp; more.</p>',
        'imageLinks' => ['large' => 'https://example.test/large.jpg',
            'thumbnail' => 'http://example.test/book.jpg'],
    ]],
    'movie' => ['id' => 42, 'title' => 'Fixture Movie', 'original_title' => 'Original Movie',
        'original_language' => 'en', 'release_date' => '2024-02-29', 'runtime' => 139,
        'poster_path' => '/poster.jpg', 'backdrop_path' => '/backdrop.jpg', 'overview' => 'Movie description',
        'genres' => [['id' => 18, 'name' => 'Drama'], ['id' => 53, 'name' => 'Thriller']],
        'credits' => ['cast' => [['name' => 'Actor']], 'crew' => [
            ['job' => 'Writer', 'name' => 'Writer'], ['job' => 'Director', 'name' => ' A. Director '],
            ['job' => 'Director', 'name' => 'B. Director'], ['job' => 'Director', 'name' => 'A. Director'],
        ]], 'vote_average' => 9.1],
    'tv' => ['id' => 42, 'name' => 'Fixture Show', 'original_name' => 'Original Show',
        'original_language' => 'en', 'first_air_date' => '2020-01-02', 'last_air_date' => '2024-06-07',
        'number_of_seasons' => 5, 'number_of_episodes' => 62, 'status' => 'Ended',
        'poster_path' => '/show.jpg', 'backdrop_path' => '/show-back.jpg', 'overview' => 'Show description',
        'genres' => [['id' => 18, 'name' => 'Drama']], 'seasons' => [['season_number' => 1]]],
    // De vorm volgt los gecontroleerde RAWG-responses; alle waarden zijn vaste testgegevens.
    'game' => ['id' => 62, 'name' => 'Fixture Game', 'released' => '2021-06-07',
        'background_image' => 'https://example.test/game.jpg',
        'description_raw' => 'Plain game description', 'description' => '<p>HTML fallback</p>',
        'genres' => [['id' => 4, 'name' => 'Action']],
        'platforms' => [['platform' => ['id' => 4, 'name' => 'PC'], 'requirements' => []],
            ['platform' => ['id' => 7, 'name' => 'Switch']]],
        'developers' => [['id' => 1, 'name' => 'Example Studio']],
        'publishers' => [['id' => 2, 'name' => 'Example Publisher']], 'rating' => 5],
];
$expectedSpecific = [
    'book' => ['authors' => ['A. Author', 'B. Writer'], 'publisher' => 'Example Press', 'pageCount' => 320,
        'publishedDate' => '1997-06', 'language' => 'en', 'isbn10' => '0306406152', 'isbn13' => '9780306406157'],
    'movie' => ['originalTitle' => 'Original Movie', 'originalLanguage' => 'en',
        'releaseDate' => '2024-02-29', 'runtimeMinutes' => 139, 'directors' => ['A. Director', 'B. Director']],
    'tv' => ['originalTitle' => 'Original Show', 'originalLanguage' => 'en', 'firstAirDate' => '2020-01-02',
        'lastAirDate' => '2024-06-07', 'numberOfSeasons' => 5, 'numberOfEpisodes' => 62, 'seriesStatus' => 'Ended'],
    'game' => ['releaseDate' => '2021-06-07', 'platforms' => ['PC', 'Switch'],
        'developers' => ['Example Studio'], 'publishers' => ['Example Publisher']],
];
$expectedOptional = [
    'book' => ['artworkImage' => 'https://example.test/large.jpg', 'description' => 'A book & more.',
        'genres' => ['Fiction', 'Adventure']],
    'movie' => ['artworkImage' => 'https://image.tmdb.org/t/p/w500/poster.jpg',
        'backdropImage' => 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
        'description' => 'Movie description', 'genres' => ['Drama', 'Thriller']],
    'tv' => ['artworkImage' => 'https://image.tmdb.org/t/p/w500/show.jpg',
        'backdropImage' => 'https://image.tmdb.org/t/p/w780/show-back.jpg',
        'description' => 'Show description', 'genres' => ['Drama']],
    'game' => ['artworkImage' => 'https://example.test/game.jpg', 'description' => 'Plain game description',
        'genres' => ['Action']],
];
$sparse = [
    'book' => ['id' => 'book_1-X', 'volumeInfo' => ['title' => 'Sparse']],
    'movie' => ['id' => 42, 'title' => 'Sparse'],
    'tv' => ['id' => 42, 'name' => 'Sparse'],
    'game' => ['id' => 62, 'name' => 'Sparse'],
];
$originalEnvironment = [];
foreach (['TMDB_API_TOKEN', 'RAWG_API_KEY', 'GOOGLE_BOOKS_API_KEY', 'VITE_GOOGLE_BOOKS_API_KEY'] as $name) {
    $originalEnvironment[$name] = $_ENV[$name] ?? null;
    $_ENV[$name] = 'fixture-secret';
}
$http = new DetailProviderHttp();
$resolver = new ProviderMediaResolver($http);

try {
    verifyDetail($resolver instanceof MediaDetailResolver && $resolver instanceof MediaResolver
        && $resolver instanceof MediaSearcher, 'All existing and new resolver contracts must be available.');
    foreach ($identities as $type => [$source, $mediaType, $id]) {
        $http->response = $fixtures[$type];
        $before = count($http->calls);
        $detail = $resolver->resolveDetail($source, $mediaType, $id);
        verifyDetail(count($http->calls) === $before + 1, 'A detail lookup must make one provider request.');
        verifyDetail($detail['source'] === $source && $detail['mediaType'] === $mediaType
            && $detail['sourceId'] === $id && $detail['title'] === 'Fixture ' . ucfirst($type === 'tv' ? 'Show' : $type),
            'Detail identity/title must remain normalized.');
        verifyDetail($detail['details'] instanceof stdClass && (array) $detail['details'] === $expectedSpecific[$type],
            'Incorrect type-specific metadata for ' . $type . '.');
        verifyDetail(array_diff_key($detail, array_flip(['source', 'mediaType', 'sourceId', 'title', 'details']))
            === $expectedOptional[$type], 'Incorrect shared detail fields for ' . $type . '.');
        $request = $http->calls[array_key_last($http->calls)];
        $url = parse_url($request['url']);
        parse_str($url['query'] ?? '', $query);
        verifyDetail($url['scheme'] === 'https' && $url['host'] === match ($source) {
            'google-books' => 'www.googleapis.com', 'tmdb' => 'api.themoviedb.org', 'rawg' => 'api.rawg.io',
        }, 'Provider hosts must be fixed HTTPS hosts.');
        if ($source === 'tmdb') {
            verifyDetail($request['headers'] === ['Authorization: Bearer fixture-secret']
                && !str_contains($request['url'], 'fixture-secret') && $query['language'] === 'en-US'
                && ($query['append_to_response'] ?? null) === ($type === 'movie' ? 'credits' : null),
                'TMDB detail authentication or credits request changed.');
        } else {
            verifyDetail($query['key'] === 'fixture-secret' && $request['headers'] === [],
                'Book/game details must use backend credentials.');
        }

        $http->response = $sparse[$type];
        $detail = $resolver->resolveDetail($source, $mediaType, $id);
        verifyDetail(array_keys($detail) === ['source', 'mediaType', 'sourceId', 'title', 'details']
            && $detail['details'] instanceof stdClass && (array) $detail['details'] === [],
            'Sparse responses must omit every optional field for ' . $type . '.');
        verifyDetail(json_decode(json_encode($detail, JSON_THROW_ON_ERROR))->details instanceof stdClass,
            'Empty details must encode as an object, never an array.');
    }

    foreach (['1997', '1997-06', '1997-06-26', '2024-02-29'] as $date) {
        $http->response = $sparse['book'];
        $http->response['volumeInfo']['publishedDate'] = $date;
        verifyDetail($resolver->resolveDetail(...$identities['book'])['details']->publishedDate === $date,
            'Publication date precision must be preserved.');
    }
    foreach (['', '0000', '1997-00', '1997-13', '2023-02-29', '1997-06-31', '1997-6',
        '1997-06-26junk', 'next year', 1997, null, []] as $date) {
        $http->response = $sparse['book'];
        $http->response['volumeInfo']['publishedDate'] = $date;
        verifyDetail(!isset($resolver->resolveDetail(...$identities['book'])['details']->publishedDate),
            'Malformed publication dates must be omitted.');
    }
    foreach (['movie' => ['release_date' => 'releaseDate'], 'tv' => ['first_air_date' => 'firstAirDate',
        'last_air_date' => 'lastAirDate'], 'game' => ['released' => 'releaseDate']] as $type => $fields) {
        foreach ($fields as $input => $output) {
            foreach (['2023-02-29', '1997', '1997-06', '2024-01-01junk', null, []] as $date) {
                $http->response = $sparse[$type];
                $http->response[$input] = $date;
                verifyDetail(!isset($resolver->resolveDetail(...$identities[$type])['details']->$output),
                    'Non-book dates must be valid full calendar dates.');
            }
        }
    }

    foreach ([0, -1, '320', 2.5, 2.0, true, false, null, [], INF, NAN, PHP_INT_MAX] as $invalid) {
        foreach (['book' => ['pageCount'], 'movie' => ['runtime'],
            'tv' => ['number_of_seasons', 'number_of_episodes']] as $type => $fields) {
            $http->response = $sparse[$type];
            foreach ($fields as $field) {
                if ($type === 'book') $http->response['volumeInfo'][$field] = $invalid;
                else $http->response[$field] = $invalid;
            }
            verifyDetail((array) $resolver->resolveDetail(...$identities[$type])['details'] === [],
                'Invalid, zero, fractional, or oversized numeric metadata must be omitted.');
        }
    }

    $http->response = $sparse['book'];
    $http->response['volumeInfo']['industryIdentifiers'] = [
        ['type' => 'ISBN_10', 'identifier' => 306406152],
        ['type' => 'OTHER', 'identifier' => '9780306406157'],
        ['type' => 'ISBN_13', 'identifier' => '9780306406157-extra'],
        ['type' => 'ISBN_10', 'identifier' => '0-306-40615-2'],
        ['type' => 'ISBN_13', 'identifier' => '978 0 306 40615 7'],
    ];
    $detail = $resolver->resolveDetail(...$identities['book']);
    verifyDetail($detail['details']->isbn10 === '0306406152' && $detail['details']->isbn13 === '9780306406157',
        'ISBNs must remain strings with leading zeroes and reject invalid/non-ISBN identifiers.');
    $http->response['volumeInfo']['industryIdentifiers'] = [['type' => 'ISBN_10', 'identifier' => '080442957x']];
    verifyDetail($resolver->resolveDetail(...$identities['book'])['details']->isbn10 === '080442957X',
        'ISBN-10 check characters should normalize to uppercase.');

    $html = '<p>Hello &amp; <b>world</b><script>alert("x")</script><style>body{}</style></p>'
        . '<p>Next<br>line &lt;em&gt;safe&lt;/em&gt;<!-- hidden --><img src=x onerror=alert(1)></p>';
    foreach ($identities as $type => $identity) {
        $http->response = $sparse[$type];
        if ($type === 'book') $http->response['volumeInfo']['description'] = $html;
        else $http->response[$type === 'game' ? 'description' : 'overview'] = $html;
        verifyDetail($resolver->resolveDetail(...$identity)['description'] === "Hello & world\nNext\nline safe",
            'Descriptions must become safe plain text with useful paragraph boundaries.');
    }
    $http->response = $fixtures['game'];
    $http->response['description_raw'] = '  ';
    verifyDetail($resolver->resolveDetail(...$identities['game'])['description'] === 'HTML fallback',
        'Empty RAWG raw descriptions must fall back to converted HTML.');
    foreach ([null, [], true, '', '<script>secret</script>'] as $empty) {
        $http->response = $sparse['game'];
        $http->response['description_raw'] = $empty;
        verifyDetail(!isset($resolver->resolveDetail(...$identities['game'])['description']),
            'Unavailable descriptions must be omitted.');
    }

    foreach (['javascript:alert(1)', 'data:image/svg+xml,bad', '//example.test/image.jpg',
        'https://', 'ftp://example.test/image.jpg', [], null] as $unsafe) {
        $http->response = $sparse['book'];
        $http->response['volumeInfo']['imageLinks'] = ['large' => $unsafe];
        verifyDetail(!isset($resolver->resolveDetail(...$identities['book'])['artworkImage']),
            'Unsafe book artwork must be omitted.');
        $http->response = $sparse['game'];
        $http->response['background_image'] = $unsafe;
        verifyDetail(!isset($resolver->resolveDetail(...$identities['game'])['artworkImage']),
            'Unsafe game artwork must be omitted.');
    }
    $http->response = $sparse['book'];
    $http->response['volumeInfo']['imageLinks'] = ['large' => 'javascript:bad',
        'thumbnail' => 'http://example.test/fallback.jpg'];
    verifyDetail($resolver->resolveDetail(...$identities['book'])['artworkImage'] === 'https://example.test/fallback.jpg',
        'Book artwork should fall back safely and upgrade provider HTTP images.');
    $http->response = $sparse['game'];
    $http->response['background_image'] = 'http://example.test/game.jpg';
    verifyDetail(!isset($resolver->resolveDetail(...$identities['game'])['artworkImage']),
        'RAWG HTTP images must remain rejected.');
    foreach (['movie', 'tv'] as $type) {
        $http->response = $sparse[$type];
        $http->response['poster_path'] = 'https://evil.test/poster.jpg';
        $http->response['backdrop_path'] = '/../bad/path.jpg';
        $detail = $resolver->resolveDetail(...$identities[$type]);
        verifyDetail(!isset($detail['artworkImage'], $detail['backdropImage'])
            && !array_key_exists('artworkImage', $detail) && !array_key_exists('backdropImage', $detail),
            'TMDB artwork paths must remain constrained to fixed HTTPS image URLs.');
    }

    foreach ([null, [], 'invalid', ['crew' => false], ['crew' => ['not-a-list' => ['job' => 'Director']]],
        ['crew' => [null, 'bad', ['job' => 'Writer', 'name' => 'Writer'], ['job' => 'Director', 'name' => []]]]] as $credits) {
        $http->response = $sparse['movie'];
        $http->response['credits'] = $credits;
        verifyDetail(!isset($resolver->resolveDetail(...$identities['movie'])['details']->directors),
            'Missing/malformed credits must not prevent movie details.');
    }
    $http->response = $sparse['movie'];
    $http->response['credits']['crew'] = array_fill(0, 45, ['job' => 'Writer', 'name' => 'Writer']);
    $http->response['credits']['crew'][] = ['job' => 'Director', 'name' => 'Late Director'];
    verifyDetail($resolver->resolveDetail(...$identities['movie'])['details']->directors === ['Late Director'],
        'Directors must not disappear when they occur after the first 32 crew members.');
    $http->response['credits']['crew'] = array_fill(0, 40, ['job' => 'Director', 'name' => 'Same Director']);
    $http->response['credits']['crew'][] = ['job' => 'Director', 'name' => 'Second Director'];
    verifyDetail($resolver->resolveDetail(...$identities['movie'])['details']->directors === ['Same Director', 'Second Director'],
        'Duplicate crew entries must not consume the director name budget.');
    $http->response['credits']['crew'] = array_map(static fn (int $i): array => [
        'job' => 'Director', 'name' => 'Director ' . $i,
    ], range(1, 40));
    verifyDetail(count($resolver->resolveDetail(...$identities['movie'])['details']->directors) === 32,
        'Director names must remain bounded even when credits contain many directors.');

    foreach ([null, [], 'invalid', ['not-a-list' => ['name' => 'Invalid']], [null, [], ['name' => []]]] as $missing) {
        $http->response = $sparse['game'];
        foreach (['genres', 'platforms', 'developers', 'publishers'] as $field) $http->response[$field] = $missing;
        $detail = $resolver->resolveDetail(...$identities['game']);
        verifyDetail((array) $detail['details'] === [] && !isset($detail['genres']),
            'Missing or malformed game arrays must not produce empty metadata fields.');
    }
    $http->response = $sparse['game'];
    $http->response['platforms'] = [null, ['platform' => null], ['platform' => ['name' => ' PC ']],
        ['platform' => ['name' => 'PC']], ['platform' => ['name' => 'Switch']]];
    $http->response['developers'] = [['name' => ' Studio '], ['name' => 'Studio'], ['name' => '']];
    $detail = $resolver->resolveDetail(...$identities['game']);
    verifyDetail($detail['details']->platforms === ['PC', 'Switch'] && $detail['details']->developers === ['Studio'],
        'Game names must be trimmed, deduplicated, and tolerate malformed neighbors.');

    $http->response = $sparse['book'];
    $http->response['volumeInfo']['authors'] = array_map(static fn (int $i): string => 'Author ' . $i, range(1, 40));
    $http->response['volumeInfo']['categories'] = array_map(static fn (int $i): string => 'Category ' . $i, range(1, 40));
    $http->response['volumeInfo']['publisher'] = str_repeat('p', 400);
    $http->response['volumeInfo']['description'] = str_repeat('d', 21000);
    $detail = $resolver->resolveDetail(...$identities['book']);
    verifyDetail(count($detail['details']->authors) === 32 && count($detail['genres']) === 32
        && strlen($detail['details']->publisher) === 256 && strlen($detail['description']) === 20000,
        'Detail arrays and strings must be bounded.');
    verifyDetail(!isset($detail['details']->categories), 'Book categories must exist only as shared genres.');
    $http->response = $sparse['game'];
    $http->response['developers'] = array_map(static fn (int $i): array => ['name' => str_repeat('x', 300) . $i], range(1, 40));
    $http->response['publishers'] = array_map(static fn (int $i): array => ['name' => 'Publisher ' . $i], range(1, 40));
    $detail = $resolver->resolveDetail(...$identities['game']);
    verifyDetail(count($detail['details']->developers) === 1 && strlen($detail['details']->developers[0]) === 256
        && count($detail['details']->publishers) === 32, 'Game named arrays must be bounded and deduplicated.');

    foreach ($identities as $type => $identity) {
        foreach ([[], ['id' => $identity[2]], ['id' => 'mismatch'], ['id' => true], ['id' => []],
            array_replace($sparse[$type], ['id' => 'mismatch'])] as $malformed) {
            $http->response = $malformed;
            expectDetailError(static fn () => $resolver->resolveDetail(...$identity));
        }
        foreach ([null, [], '', '   ', false, "\xFF"] as $title) {
            $http->response = $sparse[$type];
            if ($type === 'book') $http->response['volumeInfo']['title'] = $title;
            else $http->response[$type === 'movie' ? 'title' : 'name'] = $title;
            expectDetailError(static fn () => $resolver->resolveDetail(...$identity));
        }
    }
    $before = count($http->calls);
    foreach ([['google-books', 'movie', '42'], ['tmdb', 'anime', '42'], ['rawg', 'book', '42'],
        ['https://evil.test', 'book', '42'], ['tmdb', 'movie', '../42'], ['rawg', 'game', '42?key=bad'],
        ['google-books', 'book', 'https://evil.test'], ['google-books', 'book', str_repeat('x', 192)],
        ['tmdb', 'movie', '0'], ['rawg', 'game', '01'], ['tmdb', 'tv', ''], ['tmdb', 'movie', str_repeat('1', 21)]] as $identity) {
        expectDetailError(static fn () => $resolver->resolveDetail(...$identity));
    }
    verifyDetail(count($http->calls) === $before, 'Invalid identities must never reach a provider.');

    foreach ([404 => [404, 'media_not_found'], 429 => [503, 'provider_unavailable'],
        500 => [503, 'provider_unavailable'], 502 => [502, 'provider_error'],
        503 => [503, 'provider_unavailable'], 401 => [503, 'provider_unavailable'],
        403 => [503, 'provider_unavailable']] as $upstream => [$status, $code]) {
        $http->failure = new ProviderException($upstream, 'unsafe', 'https://provider.test/?key=fixture-secret');
        expectDetailError(static fn () => $resolver->resolveDetail(...$identities['movie']), $status, $code);
    }
    $http->failure = null;
    foreach (['movie' => 'TMDB_API_TOKEN', 'game' => 'RAWG_API_KEY'] as $type => $name) {
        $_ENV[$name] = '';
        $before = count($http->calls);
        expectDetailError(static fn () => $resolver->resolveDetail(...$identities[$type]), 503, 'provider_unavailable');
        verifyDetail(count($http->calls) === $before, 'Missing credentials must prevent provider calls.');
        $_ENV[$name] = 'fixture-secret';
    }
    $_ENV['GOOGLE_BOOKS_API_KEY'] = '';
    $_ENV['VITE_GOOGLE_BOOKS_API_KEY'] = 'browser-only-fixture';
    $http->response = $sparse['book'];
    $resolver->resolveDetail(...$identities['book']);
    verifyDetail($http->calls[array_key_last($http->calls)]['url'] === 'https://www.googleapis.com/books/v1/volumes/book_1-X',
        'Book details must not fall back to the frontend browser key.');
    $_ENV['GOOGLE_BOOKS_API_KEY'] = 'fixture-secret';

    $expectedLegacy = [
        'book' => ['source' => 'google-books', 'sourceId' => 'book_1-X', 'mediaType' => 'book', 'title' => 'Fixture Book',
            'authors' => ['A. Author', 'B. Writer'], 'publishedDate' => '1997-06', 'publishedYear' => '1997',
            'coverImage' => 'https://example.test/book.jpg', 'description' => '<p>A <b>book</b> &amp; more.</p>'],
        'movie' => ['source' => 'tmdb', 'sourceId' => '42', 'mediaType' => 'movie', 'title' => 'Fixture Movie',
            'originalTitle' => 'Original Movie', 'releaseDate' => '2024-02-29', 'releaseYear' => '2024',
            'posterImage' => 'https://image.tmdb.org/t/p/w342/poster.jpg',
            'backdropImage' => 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
            'description' => 'Movie description', 'originalLanguage' => 'en'],
        'tv' => ['source' => 'tmdb', 'sourceId' => '42', 'mediaType' => 'tv', 'title' => 'Fixture Show',
            'originalTitle' => 'Original Show', 'firstAirDate' => '2020-01-02', 'firstAirYear' => '2020',
            'posterImage' => 'https://image.tmdb.org/t/p/w342/show.jpg',
            'backdropImage' => 'https://image.tmdb.org/t/p/w780/show-back.jpg',
            'description' => 'Show description', 'originalLanguage' => 'en'],
        'game' => ['source' => 'rawg', 'sourceId' => '62', 'mediaType' => 'game', 'title' => 'Fixture Game',
            'releaseDate' => '2021-06-07', 'releaseYear' => '2021', 'coverImage' => 'https://example.test/game.jpg',
            'platforms' => ['PC', 'Switch']],
    ];
    foreach ($identities as $type => $identity) {
        $http->response = $fixtures[$type];
        $before = count($http->calls);
        verifyDetail($resolver->resolve(...$identity) === $expectedLegacy[$type],
            'Existing Library resolution contract changed for ' . $type . '.');
        verifyDetail(count($http->calls) === $before + 1
            && !str_contains($http->calls[array_key_last($http->calls)]['url'], 'append_to_response'),
            'Existing Library resolution must not start requesting credits.');
        if ($type === 'book') continue;
        $http->response = ['results' => [$fixtures[$type]]];
        $before = count($http->calls);
        verifyDetail($resolver->search($type, 'query') === [$expectedLegacy[$type]],
            'Discovery must retain its lightweight normalization contract.');
        $path = parse_url($http->calls[array_key_last($http->calls)]['url'], PHP_URL_PATH);
        verifyDetail(count($http->calls) === $before + 1 && $path === ($type === 'game' ? '/api/games' : '/3/search/' . $type),
            'Discovery must make only its search request, never per-result detail calls.');
    }

    echo 'Media detail provider tests passed (', $checks, " assertions; no live requests or database connections).\n";
} finally {
    foreach ($originalEnvironment as $name => $value) {
        if ($value === null) unset($_ENV[$name]);
        else $_ENV[$name] = $value;
    }
}
