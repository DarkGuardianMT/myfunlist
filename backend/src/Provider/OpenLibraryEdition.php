<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;

final class OpenLibraryEdition
{
    public static function fromSearch(array $work): array
    {
        $edition = $work['selectedEdition'] ?? null;
        $id = is_array($edition) ? ($edition['editionId'] ?? null) : null;
        $workId = $work['workId'] ?? null;
        if (!is_string($id) || !MediaRules::isValidSourceId('open-library', $id)
            || !is_string($workId) || preg_match('/^OL[1-9][0-9]{0,28}W$/D', $workId) !== 1
            || self::text($edition['title'] ?? null) === null
            || in_array($edition['languageStatus'] ?? null, ['inconsistent', 'mismatch', 'ambiguous'], true)) {
            throw self::unavailable();
        }

        // Alleen de cover van deze editie mag als editie-artwork worden opgeslagen.
        $coverId = $work['cover']['id'] ?? null;
        $cover = ($work['provenance']['cover']['field'] ?? null) === 'editions.docs[0].cover_i'
            && is_int($coverId) && $coverId > 0 && $coverId <= 1000000000
            ? 'https://covers.openlibrary.org/b/id/' . $coverId . '-M.jpg?default=false' : null;
        $dates = self::texts($edition['publicationDates'] ?? null);
        $date = $dates[0] ?? null;
        $summary = [
            'source' => 'open-library', 'mediaType' => 'book', 'sourceId' => $id,
            'title' => self::text($edition['title']), 'workId' => $workId,
            'workTitle' => self::text($work['workTitle'] ?? null),
            'authors' => self::texts($work['authors'] ?? null), 'authorSource' => 'work',
            'workFirstPublicationYear' => is_int($work['firstPublicationYear'] ?? null)
                && $work['firstPublicationYear'] > 0 && $work['firstPublicationYear'] <= 9999
                ? $work['firstPublicationYear'] : null,
            'publishedDate' => $date,
            'publishedYear' => $date !== null && preg_match('/^[0-9]{4}(?:$|[- ])/', $date) === 1 ? substr($date, 0, 4) : null,
            'publicationDates' => $dates,
            'languages' => array_values(array_filter(self::texts($edition['languages'] ?? null),
                static fn (string $code): bool => preg_match('/^[a-z]{3}$/D', $code) === 1)),
            'isbns' => array_values(array_filter(self::texts($edition['isbns'] ?? null), OpenLibraryQuery::validIsbn(...))),
            'coverImage' => $cover, 'metadataSource' => 'open-library-search',
        ];
        // De bestaande TEXT-kolom moet ook bij lange Unicode-metadata binnen haar bytegrens blijven.
        if (strlen(json_encode($summary, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > 60000) {
            throw self::unavailable();
        }
        return $summary;
    }

    public static function detail(array $media): array
    {
        // Hergebruik uitsluitend publieke, eerder door de server gevalideerde catalogusvelden.
        $metadata = $media['metadata'];
        $summary = self::fromSearch([
            'workId' => $metadata['workId'] ?? null, 'workTitle' => $metadata['workTitle'] ?? null,
            'authors' => $metadata['authors'] ?? null,
            'firstPublicationYear' => $metadata['workFirstPublicationYear'] ?? null,
            'selectedEdition' => ['editionId' => $media['source_id'], 'title' => $media['title'],
                'publicationDates' => $metadata['publicationDates'] ?? null,
                'languages' => $metadata['languages'] ?? null, 'isbns' => $metadata['isbns'] ?? null],
        ]);
        $details = ['editionId' => $summary['sourceId'], 'workId' => $summary['workId']];
        foreach (['workTitle', 'workFirstPublicationYear', 'publicationDates', 'languages', 'isbns'] as $field) {
            if ($summary[$field] !== null && $summary[$field] !== []) $details[$field] = $summary[$field];
        }
        if ($summary['authors'] !== []) $details['workAuthors'] = $summary['authors'];
        $cover = $metadata['coverImage'] ?? null;
        $safeCover = is_string($cover)
            && preg_match('~^https://covers\.openlibrary\.org/b/id/[1-9][0-9]{0,9}-M\.jpg\?default=false$~D', $cover) === 1;
        return ['source' => 'open-library', 'mediaType' => 'book', 'sourceId' => $summary['sourceId'],
            'title' => $summary['title'], 'details' => (object) $details,
            'metadataSource' => 'persisted-search', ...($safeCover ? ['artworkImage' => $cover] : [])];
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^[^\x00-\x1F\x7F]{1,500}$/uD', trim($value)) === 1 ? trim($value) : null;
    }

    private static function texts(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) return [];
        return array_values(array_unique(array_filter(array_map(self::text(...), array_slice($value, 0, 30)))));
    }

    public static function unavailable(): ApiException
    {
        return new ApiException(409, 'edition_unavailable',
            'This edition is no longer available to save. Search Open Library again and inspect the selected edition.');
    }
}
