<?php

declare(strict_types=1);

namespace MyFunList\Library;

use DateTimeImmutable;
use DateTimeZone;
use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use stdClass;

final class LibraryImportService
{
    public const MAX_ITEMS = 200;
    public const MAX_BODY_BYTES = 131072;

    public function __construct(private readonly LibraryService $library)
    {
    }

    public function import(AuthenticatedUser $user, array $input): array
    {
        $items = $input['items'] ?? null;
        if (array_keys($input) !== ['items'] || !is_array($items) || !array_is_list($items)) {
            throw new ApiException(422, 'validation_error', 'Provide an items array.');
        }
        if (count($items) > self::MAX_ITEMS) {
            throw new ApiException(422, 'batch_too_large', 'Import up to 200 items per request.');
        }

        $summary = [
            'total' => count($items),
            'imported' => 0,
            'existing' => 0,
            'duplicate' => 0,
            'failed' => 0,
        ];
        $results = [];
        $seen = [];

        foreach ($items as $index => $item) {
            $mediaKey = null;
            try {
                [$identity, $personalState] = self::validateItem($item);
                $mediaKey = implode(':', $identity);
                if (isset($seen[$mediaKey])) {
                    $summary['duplicate']++;
                    $results[] = ['index' => $index, 'mediaKey' => $mediaKey, 'status' => 'duplicate'];
                    continue;
                }
                $seen[$mediaKey] = true;

                $outcome = $this->library->importItem($user, $identity, $personalState);
                $status = $outcome['added'] ? 'imported' : 'existing';
                $summary[$status]++;
                $results[] = ['index' => $index, 'mediaKey' => $mediaKey, 'status' => $status];
            } catch (ApiException $exception) {
                $summary['failed']++;
                $results[] = [
                    'index' => $index,
                    'mediaKey' => $mediaKey,
                    'status' => 'failed',
                    'error' => ['code' => $exception->errorCode],
                ];
            }
        }

        return ['summary' => $summary, 'results' => $results];
    }

    private static function validateItem(mixed $item): array
    {
        if (!$item instanceof stdClass) {
            throw self::invalidItem();
        }
        $fields = get_object_vars($item);
        if (count($fields) !== 2 || !array_key_exists('media', $fields)
            || !array_key_exists('userMedia', $fields)
            || !$fields['userMedia'] instanceof stdClass) {
            throw self::invalidItem();
        }

        $identity = LibraryService::validateIdentity(['media' => $fields['media']]);
        $state = get_object_vars($fields['userMedia']);
        if (count($state) !== 3 || !array_key_exists('status', $state)
            || !array_key_exists('rating', $state)
            || !array_key_exists('addedAt', $state)) {
            throw self::invalidItem();
        }
        if (!is_string($state['status'])
            || !MediaRules::isValidStatus($identity[1], $state['status'])
            || !MediaRules::isValidRating($state['rating'])) {
            throw self::invalidItem();
        }

        return [$identity, [
            'status' => $state['status'],
            'rating' => $state['rating'],
            'addedAt' => self::utcTimestamp($state['addedAt']),
        ]];
    }

    private static function utcTimestamp(mixed $value): string
    {
        if (!is_string($value) || strlen($value) > 40
            || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D', $value) !== 1) {
            throw self::invalidItem();
        }
        if (!str_ends_with($value, 'Z')) {
            $offset = substr($value, -6);
            $hours = (int) substr($offset, 1, 2);
            $minutes = (int) substr($offset, 4, 2);
            if ($hours > 14 || $minutes > 59 || ($hours === 14 && $minutes !== 0)) {
                throw self::invalidItem();
            }
        }

        $normalized = str_ends_with($value, 'Z') ? substr($value, 0, -1) . '+00:00' : $value;
        $format = str_contains($normalized, '.') ? '!Y-m-d\TH:i:s.uP' : '!Y-m-d\TH:i:sP';
        $date = DateTimeImmutable::createFromFormat($format, $normalized);
        if ($date === false || DateTimeImmutable::getLastErrors() !== false) {
            throw self::invalidItem();
        }
        $utc = $date->setTimezone(new DateTimeZone('UTC'));
        $minimum = new DateTimeImmutable('1970-01-01T00:00:00Z');
        $maximum = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+1 day');
        if ($utc < $minimum || $utc > $maximum) {
            throw self::invalidItem();
        }

        return $utc->format('Y-m-d H:i:s.u');
    }

    private static function invalidItem(): ApiException
    {
        return new ApiException(422, 'validation_error', 'Invalid import item.');
    }
}
