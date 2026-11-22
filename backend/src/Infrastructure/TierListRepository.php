<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use DateTimeImmutable;
use DateTimeZone;
use MyFunList\TierLists\TierListMedia;
use PDO;
use PDOException;
use UnexpectedValueException;

final class TierListRepository
{
    private const BOARD = 'id, title, description, allowed_types, revision, created_at, updated_at';
    private const PAGE_SIZE = 50;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForUser(string $userId, ?string $beforeId): array
    {
        $sql = 'SELECT ' . self::BOARD . ', (SELECT COUNT(*) FROM tier_list_items WHERE list_id = tier_lists.id) AS item_count'
            . ' FROM tier_lists WHERE user_id = ?';
        $values = [$userId];
        if ($beforeId !== null) {
            $sql .= ' AND id < ?';
            $values[] = $beforeId;
        }
        $rows = $this->run($sql . ' ORDER BY id DESC LIMIT ' . (self::PAGE_SIZE + 1), $values)->fetchAll();
        $boards = array_map(static fn (array $row): array => self::board($row) + ['itemCount' => (int) $row['item_count']],
            array_slice($rows, 0, self::PAGE_SIZE));
        $next = count($rows) > self::PAGE_SIZE ? $boards[self::PAGE_SIZE - 1]['id'] : null;
        return ['boards' => $boards, 'nextCursor' => $next];
    }

    public function findForUser(string $userId, string $id, bool $write = false): ?array
    {
        // Zoek onder de eigenaar, zodat een vreemde bord-ID geen rij van die eigenaar vergrendelt.
        $row = $this->run('SELECT ' . self::BOARD . ' FROM tier_lists FORCE INDEX (uq_tier_lists_user_id)'
            . ' WHERE user_id = ? AND id = ?' . ($write ? ' FOR UPDATE' : ' LOCK IN SHARE MODE'), [$userId, $id])->fetch();
        return $row === false ? null : self::board($row);
    }

    public function allowedTypesForUser(string $userId, string $id, bool $lock = false): ?array
    {
        $row = $this->run('SELECT allowed_types FROM tier_lists FORCE INDEX (uq_tier_lists_user_id)'
            . ' WHERE user_id = ? AND id = ?' . ($lock ? ' LOCK IN SHARE MODE' : ''), [$userId, $id])->fetchColumn();
        return $row === false ? null : explode(',', $row);
    }

    public function insert(string $userId, array $settings, ?string $key, ?string $hash): ?string
    {
        try {
            $this->run('INSERT INTO tier_lists (user_id, title, description, allowed_types, creation_key, creation_hash)'
                . ' VALUES (?, ?, ?, ?, ?, ?)', [$userId, $settings['title'], $settings['description'],
                    implode(',', $settings['allowedTypes']), $key, $hash]);
        } catch (PDOException $exception) {
            // Alleen de unieke aanmaaksleutel kan bij een automatische bord-ID botsen.
            if ($key !== null && ($exception->errorInfo[1] ?? null) === 1062) {
                return null;
            }
            throw $exception;
        }
        return $this->connection->lastInsertId();
    }

    public function findCreation(string $userId, string $key): ?array
    {
        $row = $this->run('SELECT ' . self::BOARD . ', creation_hash FROM tier_lists'
            . ' WHERE user_id = ? AND creation_key = ? LOCK IN SHARE MODE', [$userId, $key])->fetch();
        return $row === false ? null : ['board' => self::board($row), 'hash' => $row['creation_hash']];
    }

    public function lanes(string $id): array
    {
        $rows = $this->run(<<<'SQL'
SELECT t.tier_key, t.name, t.color, m.source, m.media_type, m.source_id, m.title, m.metadata
FROM tier_list_tiers t
LEFT JOIN tier_list_items i ON i.list_id = t.list_id AND i.tier_key = t.tier_key
LEFT JOIN media m ON m.id = i.media_id
WHERE t.list_id = ?
ORDER BY t.position, i.position
SQL, [$id])->fetchAll();
        $lanes = [];
        foreach ($rows as $row) {
            $key = $row['tier_key'];
            $lanes[$key] ??= ['key' => $key, 'name' => $row['name'], 'color' => $row['color'], 'items' => []];
            if ($row['source'] !== null) {
                $lanes[$key]['items'][] = TierListMedia::card($row, json_decode($row['metadata'], true, 512, JSON_THROW_ON_ERROR));
            }
        }
        return $lanes;
    }

    public function writeLanes(string $id, array $tiers, array $unranked, array $ids, bool $replace = false): void
    {
        $tiers[] = ['key' => 'unranked', 'name' => 'Unranked', 'color' => 'Slate', 'items' => $unranked];
        $tierRows = [];
        $itemRows = [];
        foreach ($tiers as $position => $tier) {
            $key = $tier['key'];
            $tierRows[] = [$id, $key, $tier['name'], $tier['color'], $key === 'unranked' ? 12 : $position];
            foreach ($tier['items'] as $itemPosition => $item) {
                $mediaId = $ids[implode(':', [$item['source'], $item['mediaType'], $item['sourceId']])];
                $itemRows[] = [$id, $key, $mediaId, $itemPosition];
            }
        }

        if ($replace) {
            // De ouderrij blijft vergrendeld; posities en lidmaatschappen verdwijnen in dezelfde transactie.
            $this->run('DELETE FROM tier_list_tiers WHERE list_id = ?', [$id]);
        }
        $this->insertRows('INSERT INTO tier_list_tiers (list_id, tier_key, name, color, position) VALUES ', $tierRows);
        if ($itemRows !== []) {
            $this->insertRows('INSERT INTO tier_list_items (list_id, tier_key, media_id, position) VALUES ', $itemRows);
        }
    }

    public function update(string $userId, string $id, array $settings): void
    {
        $this->run('UPDATE tier_lists SET title = ?, description = ?, allowed_types = ?, revision = revision + 1'
            . ' WHERE user_id = ? AND id = ?', [$settings['title'], $settings['description'],
                implode(',', $settings['allowedTypes']), $userId, $id]);
    }

    public function delete(string $userId, string $id): void
    {
        $this->run('DELETE FROM tier_lists WHERE user_id = ? AND id = ?', [$userId, $id]);
    }

    private function run(string $sql, array $values): \PDOStatement
    {
        $statement = $this->connection->prepare($sql);
        $statement->execute($values);
        return $statement;
    }

    private function insertRows(string $sql, array $rows): void
    {
        $tuple = '(' . implode(', ', array_fill(0, count($rows[0]), '?')) . ')';
        $this->run($sql . implode(', ', array_fill(0, count($rows), $tuple)), array_merge(...$rows));
    }

    private static function board(array $row): array
    {
        return [
            'id' => (string) $row['id'], 'title' => $row['title'], 'description' => $row['description'],
            'allowedTypes' => explode(',', $row['allowed_types']), 'revision' => (int) $row['revision'],
            'createdAt' => self::date($row['created_at']), 'updatedAt' => self::date($row['updated_at']),
        ];
    }

    private static function date(string $value): string
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.u', $value, new DateTimeZone('UTC'));
        if ($date === false) {
            throw new UnexpectedValueException('Stored Tier List timestamp is invalid.');
        }
        return $date->format('Y-m-d\TH:i:s.u\Z');
    }
}
