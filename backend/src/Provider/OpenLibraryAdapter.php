<?php

declare(strict_types=1);

namespace MyFunList\Provider;

final class OpenLibraryAdapter
{
    public function __construct(private readonly ProviderHttpClient $http, private readonly string $userAgent)
    {
    }

    public function search(OpenLibraryQuery $query): array
    {
        $payload = $this->http->get('https://openlibrary.org/search.json?'
            . http_build_query($query->providerParameters(), '', '&', PHP_QUERY_RFC3986),
            ['User-Agent: ' . $this->userAgent]);
        $total = $payload['numFound'] ?? $payload['num_found'] ?? null;
        if (!is_int($total) || $total < 0 || !is_array($payload['docs'] ?? null)
            || !array_is_list($payload['docs']) || ($total === 0 && $payload['docs'] !== [])
            || ($total > 0 && $payload['docs'] === [])) {
            throw self::invalidPayload();
        }
        $items = [];
        $omitted = ['invalid' => 0, 'duplicateWork' => 0, 'language' => 0, 'isbn' => 0];
        $seen = [];
        foreach (array_slice($payload['docs'], 0, $query->limit) as $doc) {
            $item = is_array($doc) ? $this->normalize($doc, $query) : null;
            if ($item === null) {
                $omitted['invalid']++;
                continue;
            }
            if ($query->languageMode === 'strict' && ($item['selectedEdition']['languageStatus'] ?? null) !== 'match') {
                $omitted['language']++;
                continue;
            }
            if ($query->field === 'isbn' && !in_array($query->query, $item['selectedEdition']['isbns'] ?? [], true)) {
                $omitted['isbn']++;
                continue;
            }
            if (isset($seen[$item['workId']])) {
                $omitted['duplicateWork']++;
                continue;
            }
            $seen[$item['workId']] = true;
            $items[] = $item;
        }
        if ($payload['docs'] !== [] && $omitted['invalid'] === min(count($payload['docs']), $query->limit)) {
            throw self::invalidPayload();
        }
        return ['provider' => 'open-library', 'items' => $items, 'providerTotal' => $total,
            'limit' => $query->limit, 'language' => $query->language, 'languageMode' => $query->languageMode,
            'omitted' => $omitted, 'attribution' => ['label' => 'Open Library', 'url' => 'https://openlibrary.org']];
    }

    private function normalize(array $doc, OpenLibraryQuery $query): ?array
    {
        $workId = self::id($doc['key'] ?? null, 'works', 'W');
        $title = self::text($doc['title'] ?? null);
        if ($workId === null || $title === null) return null;
        $provenance = [];
        $record = static function (string $name, array $source, string $field, mixed $value, string $path) use (&$provenance): mixed {
            $provenance[$name] = ['field' => $path, 'state' => !array_key_exists($field, $source) || $source[$field] === null || $source[$field] === []
                ? 'missing' : ($value === null || $value === [] ? 'invalid' : 'present')];
            return $value;
        };
        $record('workId', $doc, 'key', $workId, 'key');
        $record('workTitle', $doc, 'title', $title, 'title');
        $authors = $record('authors', $doc, 'author_name', self::texts($doc['author_name'] ?? null), 'author_name');
        $year = $record('firstPublicationYear', $doc, 'first_publish_year',
            self::integer($doc['first_publish_year'] ?? null, 1, 9999), 'first_publish_year');
        $count = $record('editionCount', $doc, 'edition_count', self::integer($doc['edition_count'] ?? null, 0), 'edition_count');
        $edition = $doc['editions']['docs'][0] ?? null;
        $editionId = is_array($edition) ? self::id($edition['key'] ?? null, 'books', 'M') : null;
        $selected = null;
        $record('selectedEdition', $doc, 'editions', $editionId, 'editions.docs[0].key');
        $coverId = null;
        $coverField = null;
        if ($editionId !== null) {
            $languages = self::texts($edition['language'] ?? null);
            $validLanguages = $languages !== [] && is_array($edition['language'])
                && count($languages) === count($edition['language']);
            foreach ($languages as $language) {
                if (preg_match('/^[a-z]{3}$/D', $language) !== 1) $validLanguages = false;
            }
            $status = 'unknown';
            if ($validLanguages) {
                $status = $query->language === null ? 'unverified'
                    : ($languages === [OpenLibraryQuery::LANGUAGES[$query->language]] ? 'match'
                        : (in_array(OpenLibraryQuery::LANGUAGES[$query->language], $languages, true) ? 'ambiguous' : 'mismatch'));
                if (array_intersect($languages, ['und', 'zxx']) !== []) $status = 'unknown';
                if (in_array('mul', $languages, true)) $status = 'ambiguous';
                $workLanguages = array_values(array_filter(self::texts($doc['language'] ?? null),
                    static fn (string $code): bool => preg_match('/^[a-z]{3}$/D', $code) === 1
                        && !in_array($code, ['und', 'mul', 'zxx'], true)));
                if ($workLanguages !== [] && array_diff($languages, $workLanguages) !== []) $status = 'inconsistent';
            }
            $isbns = array_values(array_filter(self::texts($edition['isbn'] ?? null), OpenLibraryQuery::validIsbn(...)));
            $selected = ['editionId' => $editionId,
                'title' => $record('selectedEdition.title', $edition, 'title', self::text($edition['title'] ?? null), 'editions.docs[0].title'),
                'languages' => $record('selectedEdition.languages', $edition, 'language', $validLanguages ? $languages : [], 'editions.docs[0].language'),
                'languageStatus' => $status,
                'publicationDates' => $record('selectedEdition.publicationDates', $edition, 'publish_date', self::texts($edition['publish_date'] ?? null), 'editions.docs[0].publish_date'),
                'isbns' => $record('selectedEdition.isbns', $edition, 'isbn', $isbns, 'editions.docs[0].isbn')];
            $coverId = self::integer($edition['cover_i'] ?? null, 1);
            if ($coverId !== null) $coverField = 'editions.docs[0].cover_i';
        }
        if ($coverId === null) {
            $coverId = self::integer($doc['cover_i'] ?? null, 1);
            if ($coverId !== null) $coverField = 'cover_i';
        }
        $provenance['cover'] = ['field' => $coverField, 'state' => $coverId !== null ? 'present'
            : (isset($doc['cover_i']) || ($editionId !== null && isset($edition['cover_i'])) ? 'invalid' : 'missing')];
        return ['provider' => 'open-library', 'workId' => $workId, 'workTitle' => $title,
            'authors' => $authors, 'firstPublicationYear' => $year, 'editionCount' => $count,
            'selectedEdition' => $selected,
            'cover' => $coverId === null ? null : ['id' => $coverId,
                'url' => 'https://covers.openlibrary.org/b/id/' . $coverId . '-M.jpg?default=false'],
            'url' => 'https://openlibrary.org/works/' . $workId, 'provenance' => $provenance];
    }

    private static function id(mixed $value, string $kind, string $suffix): ?string
    {
        return is_string($value) && preg_match('~^(?:/' . $kind . '/)?(OL[1-9][0-9]*' . $suffix . ')$~D', $value, $match) === 1
            && strlen($match[1]) <= 32 ? $match[1] : null;
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^[^\x00-\x1F\x7F]{1,500}$/uD', trim($value)) === 1 ? trim($value) : null;
    }

    private static function texts(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) return [];
        return array_values(array_unique(array_filter(array_map(self::text(...), array_slice($value, 0, 30)),
            static fn (?string $text): bool => $text !== null)));
    }

    private static function integer(mixed $value, int $min, int $max = 1000000000): ?int
    {
        return is_int($value) && $value >= $min && $value <= $max ? $value : null;
    }

    private static function invalidPayload(): ProviderException
    {
        return new ProviderException(502, 'provider_error', 'Book provider returned invalid data.');
    }
}
