<?php

declare(strict_types=1);

namespace MyFunList\Domain;

final class MediaRules
{
    private const STATUSES = [
        'book' => ['want-to-read', 'reading', 'finished'],
        'movie' => ['want-to-watch', 'watched'],
        'tv' => ['want-to-watch', 'watching', 'completed'],
        'game' => ['want-to-play', 'playing', 'completed', 'dropped'],
    ];

    private const SOURCE_TYPES = [
        'google-books' => ['book'],
        'tmdb' => ['movie', 'tv'],
        'rawg' => ['game'],
    ];

    public static function supports(string $source, string $mediaType): bool
    {
        return in_array($mediaType, self::SOURCE_TYPES[$source] ?? [], true);
    }

    public static function defaultStatus(string $mediaType): ?string
    {
        return self::STATUSES[$mediaType][0] ?? null;
    }

    public static function isValidStatus(string $mediaType, string $status): bool
    {
        return in_array($status, self::STATUSES[$mediaType] ?? [], true);
    }

    public static function isValidRating(mixed $rating): bool
    {
        if ($rating === null) {
            return true;
        }

        if (!is_int($rating) && !is_float($rating)) {
            return false;
        }

        $value = (float) $rating;

        return is_finite($value) && $value >= 0.5 && $value <= 10.0 && $value * 2 === floor($value * 2);
    }
}
