<?php

declare(strict_types=1);

namespace MyFunList\Provider;

final class ProviderMediaResolver implements MediaResolver, MediaSearcher
{
    public function __construct(private readonly ProviderHttpClient $http)
    {
    }

    public function resolve(string $source, string $mediaType, string $sourceId): array
    {
        $encodedId = rawurlencode($sourceId);
        if ($source === 'google-books' && $mediaType === 'book') {
            $url = 'https://www.googleapis.com/books/v1/volumes/' . $encodedId;
            $key = self::credential('GOOGLE_BOOKS_API_KEY');
            if ($key !== '') {
                $url .= '?key=' . rawurlencode($key);
            }
            return $this->book($this->http->get($url), $sourceId);
        }
        if ($source === 'tmdb' && in_array($mediaType, ['movie', 'tv'], true)) {
            $token = self::credential('TMDB_API_TOKEN');
            if ($token === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $url = 'https://api.themoviedb.org/3/' . $mediaType . '/' . $encodedId . '?language=en-US';
            return $this->tmdb($this->http->get($url, ['Authorization: Bearer ' . $token]), $mediaType, $sourceId);
        }
        if ($source === 'rawg' && $mediaType === 'game') {
            $key = self::credential('RAWG_API_KEY');
            if ($key === '') {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $url = 'https://api.rawg.io/api/games/' . $encodedId . '?key=' . rawurlencode($key);
            return $this->game($this->http->get($url), $sourceId);
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
