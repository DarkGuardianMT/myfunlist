<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use MyFunList\Domain\MediaRules;

final class ProviderMediaResolver implements MediaResolver, MediaSearcher, MediaDetailResolver
{
    public function __construct(private readonly ProviderHttpClient $http)
    {
    }

    public function resolve(string $source, string $mediaType, string $sourceId): array
    {
        $data = $this->fetchMedia($source, $mediaType, $sourceId);

        return match ($mediaType) {
            'book' => $this->book($data, $sourceId),
            'movie', 'tv' => $this->tmdb($data, $mediaType, $sourceId),
            'game' => $this->game($data, $sourceId),
        };
    }

    public function resolveDetail(string $source, string $mediaType, string $sourceId): array
    {
        if (!MediaRules::supports($source, $mediaType) || !MediaRules::isValidSourceId($source, $sourceId)) {
            throw self::invalid();
        }

        try {
            $data = $this->fetchMedia($source, $mediaType, $sourceId, $mediaType === 'movie');
        } catch (ProviderException $exception) {
            // Neem nooit foutteksten over die een provider-URL of sleutel kunnen bevatten.
            throw match ($exception->status) {
                404 => new ProviderException(404, 'media_not_found', 'Media was not found.'),
                401, 403, 429, 503 => new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.'),
                default => $exception->status >= 500 && $exception->status !== 502
                    ? new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.')
                    : self::invalid(),
            };
        }

        return match ($mediaType) {
            'book' => $this->bookDetail($data, $sourceId),
            'movie', 'tv' => $this->tmdbDetail($data, $mediaType, $sourceId),
            'game' => $this->gameDetail($data, $sourceId),
        };
    }

    private function fetchMedia(string $source, string $mediaType, string $sourceId, bool $credits = false): array
    {
        $encodedId = rawurlencode($sourceId);
        if ($source === 'google-books' && $mediaType === 'book') {
            $url = 'https://www.googleapis.com/books/v1/volumes/' . $encodedId;
            $key = self::credential('GOOGLE_BOOKS_API_KEY');
            if ($key !== '') {
                $url .= '?key=' . rawurlencode($key);
            }
            return $this->http->get($url);
        }
        if ($source === 'tmdb' && in_array($mediaType, ['movie', 'tv'], true)) {
            $token = self::credential('TMDB_API_TOKEN');
            if ($token === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $url = 'https://api.themoviedb.org/3/' . $mediaType . '/' . $encodedId . '?language=en-US';
            if ($credits && $mediaType === 'movie') {
                $url .= '&append_to_response=credits';
            }
            return $this->http->get($url, ['Authorization: Bearer ' . $token]);
        }
        if ($source === 'rawg' && $mediaType === 'game') {
            $key = self::credential('RAWG_API_KEY');
            if ($key === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $url = 'https://api.rawg.io/api/games/' . $encodedId . '?key=' . rawurlencode($key);
            return $this->http->get($url);
        }

        throw new ProviderException(502, 'provider_error', 'Media provider could not resolve this item.');
    }

    public function search(string $mediaType, string $query): array
    {
        if ($mediaType === 'movie' || $mediaType === 'tv') {
            $token = self::credential('TMDB_API_TOKEN');
            if ($token === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $parameters = http_build_query([
                'query' => $query, 'include_adult' => 'false', 'language' => 'en-US', 'page' => '1',
            ], '', '&', PHP_QUERY_RFC3986);
            $url = 'https://api.themoviedb.org/3/search/' . $mediaType . '?' . $parameters;
            $data = $this->http->get($url, ['Authorization: Bearer ' . $token]);
        } elseif ($mediaType === 'game') {
            $key = self::credential('RAWG_API_KEY');
            if ($key === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $parameters = http_build_query([
                'key' => $key, 'search' => $query, 'page_size' => '20', 'page' => '1',
            ], '', '&', PHP_QUERY_RFC3986);
            $data = $this->http->get('https://api.rawg.io/api/games?' . $parameters);
        } else {
            throw new ProviderException(502, 'provider_error', 'Media provider is unavailable.');
        }

        $results = $data['results'] ?? null;
        if (!is_array($results) || !array_is_list($results)) {
            throw self::invalid();
        }

        $normalized = [];
        foreach (array_slice($results, 0, 20) as $item) {
            $id = is_array($item) ? ($item['id'] ?? null) : null;
            if ((!is_int($id) && !is_string($id))
                || preg_match('/^[1-9][0-9]{0,19}$/D', (string) $id) !== 1) {
                continue;
            }

            try {
                $normalized[] = $mediaType === 'game'
                    ? $this->game($item, (string) $id)
                    : $this->tmdb($item, $mediaType, (string) $id);
            } catch (ProviderException) {
                // Een onvolledig zoekresultaat mag andere geldige resultaten niet verbergen.
            }
        }

        if ($results !== [] && $normalized === []) {
            throw self::invalid();
        }

        return $normalized;
    }

    private function book(array $data, string $sourceId): array
    {
        self::requireIdentity($data, $sourceId);
        $details = $data['volumeInfo'] ?? null;
        if (!is_array($details)) {
            throw self::invalid();
        }
        $title = self::requiredTitle($details['title'] ?? null);
        $publishedDate = self::text($details['publishedDate'] ?? null);
        $links = is_array($details['imageLinks'] ?? null) ? $details['imageLinks'] : [];
        $cover = self::httpsImage($links['thumbnail'] ?? $links['smallThumbnail'] ?? null, true);
        $authors = [];
        foreach (array_slice(is_array($details['authors'] ?? null) ? $details['authors'] : [], 0, 32) as $author) {
            $name = self::text($author, 256);
            if ($name !== null) {
                $authors[] = $name;
            }
        }

        return [
            'source' => 'google-books', 'sourceId' => $sourceId, 'mediaType' => 'book', 'title' => $title,
            'authors' => $authors,
            'publishedDate' => $publishedDate,
            'publishedYear' => self::year($publishedDate),
            'coverImage' => $cover,
            'description' => self::text($details['description'] ?? null, 20000),
        ];
    }

    private function tmdb(array $data, string $mediaType, string $sourceId): array
    {
        self::requireIdentity($data, $sourceId);
        $movie = $mediaType === 'movie';
        $title = self::requiredTitle($data[$movie ? 'title' : 'name'] ?? null);
        $date = self::text($data[$movie ? 'release_date' : 'first_air_date'] ?? null);

        return [
            'source' => 'tmdb', 'sourceId' => $sourceId, 'mediaType' => $mediaType, 'title' => $title,
            'originalTitle' => self::text($data[$movie ? 'original_title' : 'original_name'] ?? null),
            ...($movie
                ? ['releaseDate' => $date, 'releaseYear' => self::year($date)]
                : ['firstAirDate' => $date, 'firstAirYear' => self::year($date)]),
            'posterImage' => self::tmdbImage($data['poster_path'] ?? null, 'w342'),
            'backdropImage' => self::tmdbImage($data['backdrop_path'] ?? null, 'w780'),
            'description' => self::text($data['overview'] ?? null, 20000),
            'originalLanguage' => self::text($data['original_language'] ?? null),
        ];
    }

    private function game(array $data, string $sourceId): array
    {
        self::requireIdentity($data, $sourceId);
        $date = self::text($data['released'] ?? null);
        $platforms = [];
        foreach (array_slice(is_array($data['platforms'] ?? null) ? $data['platforms'] : [], 0, 32) as $entry) {
            $name = is_array($entry) && is_array($entry['platform'] ?? null)
                ? self::text($entry['platform']['name'] ?? null, 256) : null;
            if ($name !== null) {
                $platforms[] = $name;
            }
        }

        return [
            'source' => 'rawg', 'sourceId' => $sourceId, 'mediaType' => 'game',
            'title' => self::requiredTitle($data['name'] ?? null),
            'releaseDate' => $date, 'releaseYear' => self::year($date),
            'coverImage' => self::httpsImage($data['background_image'] ?? null),
            'platforms' => $platforms,
        ];
    }

    private function bookDetail(array $data, string $sourceId): array
    {
        $summary = $this->book($data, $sourceId);
        $volume = $data['volumeInfo'];
        $artwork = null;
        $links = is_array($volume['imageLinks'] ?? null) ? $volume['imageLinks'] : [];
        foreach (['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'] as $size) {
            $artwork = self::httpsImage($links[$size] ?? null, true);
            if ($artwork !== null) {
                break;
            }
        }

        $identifiers = [];
        foreach (self::listValues($volume['industryIdentifiers'] ?? null) as $entry) {
            if (!is_array($entry) || !is_string($entry['identifier'] ?? null)) {
                continue;
            }
            $isbn = strtoupper(str_replace(['-', ' '], '', trim($entry['identifier'])));
            if (($entry['type'] ?? null) === 'ISBN_10' && preg_match('/^[0-9]{9}[0-9X]$/D', $isbn) === 1) {
                $identifiers['isbn10'] ??= $isbn;
            } elseif (($entry['type'] ?? null) === 'ISBN_13' && preg_match('/^[0-9]{13}$/D', $isbn) === 1) {
                $identifiers['isbn13'] ??= $isbn;
            }
        }

        return self::detail($summary, [
            'artworkImage' => $artwork,
            'description' => self::plainText($volume['description'] ?? null),
            'genres' => self::names($volume['categories'] ?? null),
        ], [
            'authors' => self::names($volume['authors'] ?? null),
            'publisher' => self::text($volume['publisher'] ?? null, 256),
            'pageCount' => self::positiveInteger($volume['pageCount'] ?? null),
            'publishedDate' => self::date($volume['publishedDate'] ?? null, true),
            'language' => self::text($volume['language'] ?? null, 32),
            ...$identifiers,
        ]);
    }

    private function tmdbDetail(array $data, string $mediaType, string $sourceId): array
    {
        $summary = $this->tmdb($data, $mediaType, $sourceId);
        $movie = $mediaType === 'movie';
        $specific = [
            'originalTitle' => $summary['originalTitle'],
            'originalLanguage' => self::text($data['original_language'] ?? null, 32),
        ];
        if ($movie) {
            $directors = [];
            $credits = is_array($data['credits'] ?? null) ? $data['credits'] : [];
            // Regisseurs staan soms ver na de eerste crewleden; begrens de uitvoer op namen.
            $crew = $credits['crew'] ?? null;
            foreach (is_array($crew) && array_is_list($crew) ? $crew : [] as $entry) {
                if (is_array($entry) && ($entry['job'] ?? null) === 'Director') {
                    $name = self::text($entry['name'] ?? null, 256);
                    if ($name !== null && !in_array($name, $directors, true)) {
                        $directors[] = $name;
                        if (count($directors) === 32) {
                            break;
                        }
                    }
                }
            }
            $specific += [
                'releaseDate' => self::date($data['release_date'] ?? null),
                'runtimeMinutes' => self::positiveInteger($data['runtime'] ?? null),
                'directors' => self::names($directors),
            ];
        } else {
            $specific += [
                'firstAirDate' => self::date($data['first_air_date'] ?? null),
                'lastAirDate' => self::date($data['last_air_date'] ?? null),
                'numberOfSeasons' => self::positiveInteger($data['number_of_seasons'] ?? null),
                'numberOfEpisodes' => self::positiveInteger($data['number_of_episodes'] ?? null),
                'seriesStatus' => self::text($data['status'] ?? null, 256),
            ];
        }

        return self::detail($summary, [
            'artworkImage' => self::tmdbImage($data['poster_path'] ?? null, 'w500'),
            'backdropImage' => $summary['backdropImage'],
            'description' => self::plainText($data['overview'] ?? null),
            'genres' => self::names($data['genres'] ?? null, 'name'),
        ], $specific);
    }

    private function gameDetail(array $data, string $sourceId): array
    {
        $summary = $this->game($data, $sourceId);
        $platforms = [];
        foreach (self::listValues($data['platforms'] ?? null) as $entry) {
            if (is_array($entry) && is_array($entry['platform'] ?? null)) {
                $platforms[] = $entry['platform']['name'] ?? null;
            }
        }

        return self::detail($summary, [
            'artworkImage' => $summary['coverImage'],
            'description' => self::plainText($data['description_raw'] ?? null)
                ?? self::plainText($data['description'] ?? null),
            'genres' => self::names($data['genres'] ?? null, 'name'),
        ], [
            'releaseDate' => self::date($data['released'] ?? null),
            'platforms' => self::names($platforms),
            'developers' => self::names($data['developers'] ?? null, 'name'),
            'publishers' => self::names($data['publishers'] ?? null, 'name'),
        ]);
    }

    private static function detail(array $summary, array $optional, array $specific): array
    {
        $present = static fn (mixed $value): bool => $value !== null;

        return [
            'source' => $summary['source'],
            'mediaType' => $summary['mediaType'],
            'sourceId' => $summary['sourceId'],
            'title' => $summary['title'],
            // Ook een volledig ontbrekende metadataset moet als JSON-object worden verstuurd.
            'details' => (object) array_filter($specific, $present),
            ...array_filter($optional, $present),
        ];
    }

    private static function listValues(mixed $value): array
    {
        return is_array($value) && array_is_list($value) ? array_slice($value, 0, 32) : [];
    }

    private static function names(mixed $value, ?string $field = null): ?array
    {
        $names = [];
        foreach (self::listValues($value) as $entry) {
            $name = self::text($field === null ? $entry : (is_array($entry) ? ($entry[$field] ?? null) : null), 256);
            if ($name !== null) {
                $names[] = $name;
            }
        }

        return $names === [] ? null : array_values(array_unique($names));
    }

    private static function positiveInteger(mixed $value): ?int
    {
        return is_int($value) && $value > 0 && $value <= 2147483647 ? $value : null;
    }

    private static function date(mixed $value, bool $partial = false): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        $pattern = $partial ? '/^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/D'
            : '/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D';
        if (preg_match($pattern, $value, $parts) !== 1
            || !checkdate((int) ($parts[2] ?? 1), (int) ($parts[3] ?? 1), (int) $parts[1])) {
            return null;
        }

        return $value;
    }

    private static function plainText(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = preg_replace('~<(script|style)\b[^>]*>.*?</\1\s*>~is', '', $value) ?? '';
        $value = preg_replace('~<br\b[^>]*>|</(?:p|div|li|h[1-6])\s*>~i', "\n", $value) ?? '';
        $value = strip_tags($value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
        $value = preg_replace('/[^\S\n]+/u', ' ', $value) ?? '';
        $value = preg_replace('/ *\n */u', "\n", $value) ?? '';
        $value = preg_replace('/\n{3,}/', "\n\n", $value) ?? '';

        return self::text($value, 20000);
    }

    private static function requireIdentity(array $data, string $sourceId): void
    {
        $id = $data['id'] ?? null;
        if ((!is_string($id) && !is_int($id)) || (string) $id !== $sourceId) {
            throw self::invalid();
        }
    }

    private static function requiredTitle(mixed $value): string
    {
        $title = self::text($value, 512);
        if ($title === null) {
            throw self::invalid();
        }

        return $title;
    }

    private static function text(mixed $value, int $limit = 2048): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);

        if ($value === '' || preg_match('/^.{0,' . $limit . '}/us', $value, $match) !== 1) {
            return null;
        }

        return $match[0];
    }

    private static function year(?string $date): ?string
    {
        return $date !== null && preg_match('/^\d{4}/', $date) === 1 ? substr($date, 0, 4) : null;
    }

    private static function tmdbImage(mixed $path, string $size): ?string
    {
        if (!is_string($path) || preg_match('~^/[A-Za-z0-9_.-]+$~D', $path) !== 1) {
            return null;
        }

        return 'https://image.tmdb.org/t/p/' . $size . $path;
    }

    private static function httpsImage(mixed $value, bool $upgradeHttp = false): ?string
    {
        $url = self::text($value);
        if ($url === null) {
            return null;
        }
        if ($upgradeHttp && str_starts_with(strtolower($url), 'http://')) {
            $url = 'https://' . substr($url, 7);
        }

        return filter_var($url, FILTER_VALIDATE_URL) !== false
            && parse_url($url, PHP_URL_SCHEME) === 'https' ? $url : null;
    }

    private static function credential(string $name): string
    {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);

        return is_string($value) ? trim($value) : '';
    }

    private static function invalid(): ProviderException
    {
        return new ProviderException(502, 'provider_error', 'Media provider returned invalid data.');
    }
}
