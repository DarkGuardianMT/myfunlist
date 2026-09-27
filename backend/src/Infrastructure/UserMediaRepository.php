<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use DateTimeImmutable;
use DateTimeZone;
use JsonException;
use LogicException;
use PDO;
use stdClass;
use UnexpectedValueException;

final class UserMediaRepository
{
    private const SELECT_ITEM = <<<'SQL'
SELECT um.id, um.status, um.rating, um.added_at,
       m.source, m.media_type, m.source_id, m.title, m.metadata
FROM user_media um
JOIN media m ON m.id = um.media_id
WHERE um.user_id = :user_id
SQL;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForUser(string $userId): array
    {
        $statement = $this->connection->prepare(
            self::SELECT_ITEM . ' ORDER BY um.added_at DESC, um.id DESC',
        );
        $statement->execute(['user_id' => $userId]);

        return array_map(self::item(...), $statement->fetchAll());
    }

    public function findById(string $userId, string $entryId, bool $lock = false): ?array
    {
        $statement = $this->connection->prepare(
            self::SELECT_ITEM . ' AND um.id = :entry_id' . ($lock ? ' FOR UPDATE' : ''),
        );
        $statement->execute(['user_id' => $userId, 'entry_id' => $entryId]);

        return self::optionalItem($statement->fetch());
    }

    public function findByMedia(string $userId, string $mediaId, bool $lock = false): ?array
    {
        $statement = $this->connection->prepare(
            self::SELECT_ITEM . ' AND um.media_id = :media_id' . ($lock ? ' FOR UPDATE' : ''),
        );
        $statement->execute(['user_id' => $userId, 'media_id' => $mediaId]);

        return self::optionalItem($statement->fetch());
    }

    public function create(string $userId, string $mediaId, string $status): string
    {
        $statement = $this->connection->prepare(
            'INSERT INTO user_media (user_id, media_id, status, rating) VALUES (?, ?, ?, NULL)',
        );
        $statement->execute([$userId, $mediaId, $status]);

        return $this->connection->lastInsertId();
    }

    public function createImported(
        string $userId,
        string $mediaId,
        string $status,
        int|float|null $rating,
        string $addedAt,
    ): string {
        $statement = $this->connection->prepare(
            'INSERT INTO user_media (user_id, media_id, status, rating, added_at) VALUES (?, ?, ?, ?, ?)',
        );
        $statement->execute([$userId, $mediaId, $status, $rating, $addedAt]);

        return $this->connection->lastInsertId();
    }

    public function update(string $userId, string $entryId, array $changes): void
    {
        $assignments = [];
        $parameters = [];
        foreach ($changes as $field => $value) {
            if (!in_array($field, ['status', 'rating'], true)) {
                throw new LogicException('Unsupported Library field.');
            }
            $assignments[] = $field . ' = ?';
            $parameters[] = $value;
        }
        $parameters[] = $userId;
        $parameters[] = $entryId;
        $statement = $this->connection->prepare(
            'UPDATE user_media SET ' . implode(', ', $assignments) . ' WHERE user_id = ? AND id = ?',
        );
        $statement->execute($parameters);
    }

    public function delete(string $userId, string $entryId): bool
    {
        $statement = $this->connection->prepare(
            'DELETE FROM user_media WHERE user_id = ? AND id = ?',
        );
        $statement->execute([$userId, $entryId]);

        return $statement->rowCount() === 1;
    }

    private static function optionalItem(array|false $row): ?array
    {
        return $row === false ? null : self::item($row);
    }

    private static function item(array $row): array
    {
        try {
            $metadata = json_decode($row['metadata'], false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('Stored media metadata is invalid.', previous: $exception);
        }
        if (!$metadata instanceof stdClass) {
            throw new UnexpectedValueException('Stored media metadata must be an object.');
        }

        $date = DateTimeImmutable::createFromFormat(
            '!Y-m-d H:i:s.u', $row['added_at'], new DateTimeZone('UTC'),
        );
        if ($date === false) {
            throw new UnexpectedValueException('Stored Library timestamp is invalid.');
        }

        return [
            'media' => [
                ...get_object_vars($metadata),
                'source' => $row['source'],
                'mediaType' => $row['media_type'],
                'sourceId' => $row['source_id'],
                'title' => $row['title'],
            ],
            'userMedia' => [
                'id' => (string) $row['id'],
                'mediaKey' => implode(':', [$row['source'], $row['media_type'], $row['source_id']]),
                'status' => $row['status'],
                'rating' => $row['rating'] === null ? null : (float) $row['rating'],
                'addedAt' => $date->format('Y-m-d\TH:i:s.u\Z'),
            ],
        ];
    }
}
