<?php

declare(strict_types=1);

namespace MyFunList\TierLists;

use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use stdClass;

final class TierListDraft
{
    public const UNRANKED = 'unranked';
    public const MAX_TIERS = 12;
    public const MAX_ITEMS = 100;
    public const MAX_REVISION = 4294967295;
    private const TYPES = ['movie', 'tv', 'book', 'game'];
    private const COLORS = ['Lime', 'Amber', 'Coral', 'Teal', 'Violet', 'Slate'];

    public static function create(array $input): array
    {
        self::only($input, ['title', 'description', 'allowedTypes'], 'board');
        return self::settings($input, true);
    }

    public static function save(array $input): array
    {
        self::only($input, ['title', 'description', 'allowedTypes', 'revision', 'tiers', 'unranked', 'removedItems'], 'board');
        if (!array_key_exists('description', $input)) {
            throw self::invalid('description', 'Supply a description or null.');
        }
        $settings = self::settings($input, false);
        $revision = self::revision($input);
        $tiers = $input['tiers'] ?? null;
        if (!is_array($tiers) || !array_is_list($tiers) || count($tiers) < 1 || count($tiers) > self::MAX_TIERS) {
            throw self::invalid('tiers', 'Supply 1 to 12 ranked tiers.');
        }

        $keys = [];
        $seen = [];
        $ranked = [];
        foreach ($tiers as $tier) {
            if (!$tier instanceof stdClass) {
                throw self::invalid('tiers', 'Each tier must be an object.');
            }
            self::only(get_object_vars($tier), ['key', 'name', 'color', 'items'], 'tiers');
            $key = $tier->key ?? null;
            if (!is_string($key) || preg_match('/^[a-z][a-z0-9_-]{0,39}$/D', $key) !== 1
                || $key === self::UNRANKED || isset($keys[$key])) {
                throw self::invalid('tiers', 'Use distinct ranked tier keys with 1 to 40 lowercase ASCII characters.');
            }
            $color = $tier->color ?? null;
            if (!in_array($color, self::COLORS, true)) {
                throw self::invalid('tiers', 'Select an approved tier color.');
            }
            $keys[$key] = true;
            $ranked[] = [
                'key' => $key,
                'name' => self::text($tier->name ?? null, 40, 'tiers'),
                'color' => $color,
                'items' => self::items($tier->items ?? null, $settings['allowedTypes'], $seen),
            ];
        }

        $removed = [];
        return $settings + ['revision' => $revision, 'tiers' => $ranked,
            'unranked' => self::items($input['unranked'] ?? null, $settings['allowedTypes'], $seen),
            'removedItems' => self::items(array_key_exists('removedItems', $input) ? $input['removedItems'] : [], self::TYPES, $removed)];
    }

    public static function deleteRevision(array $input): int
    {
        self::only($input, ['revision'], 'board');
        return self::revision($input);
    }

    public static function cursor(array $query): ?string
    {
        if ($query === []) {
            return null;
        }
        if (array_keys($query) !== ['beforeId'] || !self::validId($query['beforeId'])) {
            throw self::invalid('beforeId', 'Use the board cursor returned by the previous page.');
        }
        return $query['beforeId'];
    }

    public static function validId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^[1-9][0-9]{0,19}$/D', $id) === 1
            && (strlen($id) < 20 || strcmp($id, '18446744073709551615') <= 0);
    }

    public static function creationKey(mixed $key): ?string
    {
        if ($key === null || (is_string($key) && preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $key) === 1)) {
            return $key;
        }
        throw self::invalid('idempotencyKey', 'Use 1 to 128 ASCII letters, digits, underscores or hyphens.');
    }

    public static function defaults(): array
    {
        $tiers = [];
        foreach (['S', 'A', 'B', 'C', 'D'] as $index => $name) {
            $tiers[] = ['key' => strtolower($name), 'name' => $name, 'color' => self::COLORS[$index], 'items' => []];
        }
        return $tiers;
    }

    public static function identityKey(array $item): string
    {
        return implode(':', [$item['source'], $item['mediaType'], $item['sourceId']]);
    }

    public static function invalid(string $field, string $message): ApiException
    {
        return new ApiException(422, 'validation_error', 'Check the supplied fields.', [$field => $message]);
    }

    private static function only(array $input, array $keys, string $field): void
    {
        if (array_diff(array_keys($input), $keys) !== []) {
            throw self::invalid($field, 'Unexpected fields were supplied.');
        }
    }

    private static function text(mixed $value, int $max, string $field, bool $optional = false): ?string
    {
        if ($value === null && $optional) {
            return null;
        }
        $pattern = $optional ? '/[^\P{C}\r\n\t]/u' : '/\p{C}/u';
        if (!is_string($value) || preg_match($pattern, $value) !== 0) {
            throw self::invalid($field, 'Use text without control characters.');
        }
        $text = preg_replace('/^\s+|\s+$/u', '', $value);
        if ($text === null || (!$optional && $text === '') || preg_match_all('/./us', $text) > $max) {
            throw self::invalid($field, "Use text of up to {$max} characters.");
        }
        return $optional && $text === '' ? null : $text;
    }

    private static function settings(array $input, bool $creating): array
    {
        $types = $creating && !array_key_exists('allowedTypes', $input) ? self::TYPES : ($input['allowedTypes'] ?? null);
        if (!is_array($types) || !array_is_list($types) || count($types) < 1 || count($types) > count(self::TYPES)) {
            throw self::invalid('allowedTypes', 'Select at least one supported media type.');
        }
        $normalized = array_values(array_filter(self::TYPES, static fn (string $type): bool => in_array($type, $types, true)));
        if (count($normalized) !== count($types)) {
            throw self::invalid('allowedTypes', 'Select distinct supported media types.');
        }
        return [
            'title' => self::text($input['title'] ?? null, 120, 'title'),
            'description' => self::text($input['description'] ?? null, 1000, 'description', true),
            'allowedTypes' => $normalized,
        ];
    }

    private static function revision(array $input): int
    {
        $revision = $input['revision'] ?? null;
        if (!is_int($revision) || $revision < 1 || $revision > self::MAX_REVISION) {
            throw self::invalid('revision', 'Supply the current integer board revision.');
        }
        return $revision;
    }

    private static function items(mixed $items, array $types, array &$seen): array
    {
        if (!is_array($items) || !array_is_list($items) || count($seen) + count($items) > self::MAX_ITEMS) {
            throw self::invalid('items', 'Supply ordered item arrays with no more than 100 items per board.');
        }
        $result = [];
        foreach ($items as $item) {
            if (!$item instanceof stdClass) {
                throw self::invalid('items', 'Each item must contain only its catalogue identity.');
            }
            self::only(get_object_vars($item), ['source', 'mediaType', 'sourceId'], 'items');
            $source = $item->source ?? null;
            $type = $item->mediaType ?? null;
            $id = $item->sourceId ?? null;
            if (!is_string($source) || !in_array($type, $types, true) || !is_string($id)
                || !MediaRules::supports($source, $type) || !MediaRules::isValidSourceId($source, $id)) {
                throw self::invalid('items', 'Use a supported catalogue identity and an allowed media type.');
            }
            $identity = ['source' => $source, 'mediaType' => $type, 'sourceId' => $id];
            $key = self::identityKey($identity);
            if (isset($seen[$key])) {
                throw self::invalid('items', 'A media item can appear only once per board.');
            }
            $seen[$key] = true;
            $result[] = $identity;
        }
        return $result;
    }
}
