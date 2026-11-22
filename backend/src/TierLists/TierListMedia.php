<?php

declare(strict_types=1);

namespace MyFunList\TierLists;

use MyFunList\Domain\MediaRules;

final class TierListMedia
{
    public static function identity(array $input): array
    {
        $source = $input['source'] ?? null;
        $type = $input['mediaType'] ?? null;
        $id = $input['sourceId'] ?? null;
        if (count($input) !== 3 || !is_string($source) || !is_string($type) || !is_string($id)
            || !MediaRules::supports($source, $type) || !MediaRules::isValidSourceId($source, $id)) {
            throw TierListDraft::invalid('items', 'Supply only a supported source, media type, and exact source ID.');
        }
        return ['source' => $source, 'mediaType' => $type, 'sourceId' => $id];
    }

    public static function card(array $row, mixed $metadata): array
    {
        return [
            'source' => $row['source'], 'mediaType' => $row['media_type'], 'sourceId' => $row['source_id'],
            'title' => $row['title'],
            'artworkImage' => self::safeImage($metadata['artworkImage'] ?? $metadata['posterImage'] ?? $metadata['coverImage'] ?? null),
        ];
    }

    public static function safeImage(mixed $image): ?string
    {
        $url = is_string($image) && filter_var($image, FILTER_VALIDATE_URL) !== false ? parse_url($image) : false;
        return ($url['scheme'] ?? null) === 'https' && !empty($url['host'])
            && !isset($url['user']) && !isset($url['pass']) ? $image : null;
    }
}
