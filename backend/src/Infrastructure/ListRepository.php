<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use DateTimeImmutable;
use DateTimeZone;
use LogicException;
use PDO;
use PDOException;
use UnexpectedValueException;

final class ListRepository
{
    private const SELECT_LIST = <<<'SQL'
SELECT l.id, l.title, l.description, l.created_at, l.updated_at,
       (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS item_count
FROM lists l WHERE l.user_id = :user_id
SQL;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForUser(string $userId): array
    {
        $statement = $this->connection->prepare(
            self::SELECT_LIST . ' ORDER BY l.updated_at DESC, l.id DESC',
        );
        $statement->execute(['user_id' => $userId]);

        return array_map(self::listRow(...), $statement->fetchAll());
    }

    public function membershipsForUser(string $userId, ?array $after): array
    {
        $sql = <<<'SQL'
SELECT li.list_id, li.user_media_id
FROM lists l
JOIN list_items li ON li.list_id = l.id
JOIN user_media um ON um.id = li.user_media_id AND um.user_id = l.user_id
WHERE l.user_id = ?
SQL;
        $values = [$userId];
        if ($after !== null) {
            $sql .= ' AND (li.list_id > ? OR (li.list_id = ? AND li.user_media_id > ?))';
            array_push($values, $after['listId'], $after['listId'], $after['userMediaId']);
        }
        $statement = $this->connection->prepare($sql . ' ORDER BY li.list_id, li.user_media_id LIMIT 501');
        $statement->execute($values);
        $rows = $statement->fetchAll();
        $hasMore = count($rows) > 500;
        $memberships = array_map(static fn (array $row): array => [
            'listId' => (string) $row['list_id'], 'userMediaId' => (string) $row['user_media_id'],
        ], array_slice($rows, 0, 500));

        return ['memberships' => $memberships, 'nextCursor' => $hasMore ? $memberships[499] : null];
    }

    public function findForUser(string $userId, string $listId): ?array
    {
        $statement = $this->connection->prepare(self::SELECT_LIST . ' AND l.id = :list_id LIMIT 1');
        $statement->execute(['user_id' => $userId, 'list_id' => $listId]);
        $row = $statement->fetch();

        return $row === false ? null : self::listRow($row);
    }

    public function create(string $userId, string $title, ?string $description): string
    {
        $statement = $this->connection->prepare(
            'INSERT INTO lists (user_id, title, description) VALUES (?, ?, ?)',
        );
        $statement->execute([$userId, $title, $description]);

        return $this->connection->lastInsertId();
    }

    public function update(string $userId, string $listId, array $changes): void
    {
        $assignments = [];
        $values = [];
        foreach ($changes as $field => $value) {
            if (!in_array($field, ['title', 'description'], true)) {
                throw new LogicException('Unsupported list field.');
            }
            $assignments[] = $field . ' = ?';
            $values[] = $value;
        }
        $values[] = $userId;
        $values[] = $listId;
        $statement = $this->connection->prepare(
            'UPDATE lists SET ' . implode(', ', $assignments) . ' WHERE user_id = ? AND id = ?',
        );
        $statement->execute($values);
    }

    public function delete(string $userId, string $listId): bool
    {
        $statement = $this->connection->prepare('DELETE FROM lists WHERE user_id = ? AND id = ?');
        $statement->execute([$userId, $listId]);

        return $statement->rowCount() === 1;
    }

    public function addItem(string $userId, string $listId, string $userMediaId): bool
    {
        $statement = $this->connection->prepare(<<<'SQL'
INSERT INTO list_items (list_id, user_media_id)
SELECT l.id, um.id FROM lists l
JOIN user_media um ON um.user_id = l.user_id
WHERE l.user_id = ? AND l.id = ? AND um.id = ?
SQL);
        try {
            $statement->execute([$userId, $listId, $userMediaId]);
        } catch (PDOException $exception) {
            if ((int) ($exception->errorInfo[1] ?? 0) === 1062) {
                return false;
            }
            throw $exception;
        }

        return $statement->rowCount() === 1;
    }

    public function removeItem(string $userId, string $listId, string $userMediaId): bool
    {
        $statement = $this->connection->prepare(<<<'SQL'
DELETE li FROM list_items li
JOIN lists l ON l.id = li.list_id
WHERE l.user_id = ? AND l.id = ? AND li.user_media_id = ?
SQL);
        $statement->execute([$userId, $listId, $userMediaId]);

        return $statement->rowCount() === 1;
    }

    public function touch(string $userId, string $listId): void
    {
        $statement = $this->connection->prepare(
            'UPDATE lists SET updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ? AND id = ?',
        );
        $statement->execute([$userId, $listId]);
    }

    public function touchForLibraryEntry(string $userId, string $entryId): void
    {
        $statement = $this->connection->prepare(<<<'SQL'
UPDATE lists l
JOIN list_items li ON li.list_id = l.id
SET l.updated_at = CURRENT_TIMESTAMP(6)
WHERE l.user_id = ? AND li.user_media_id = ?
SQL);
        $statement->execute([$userId, $entryId]);
    }

    private static function listRow(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'itemCount' => (int) $row['item_count'],
            'createdAt' => self::timestamp($row['created_at']),
            'updatedAt' => self::timestamp($row['updated_at']),
        ];
    }

    private static function timestamp(string $value): string
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.u', $value, new DateTimeZone('UTC'));
        if ($date === false) {
            throw new UnexpectedValueException('Stored list timestamp is invalid.');
        }

        return $date->format('Y-m-d\TH:i:s.u\Z');
    }
}
