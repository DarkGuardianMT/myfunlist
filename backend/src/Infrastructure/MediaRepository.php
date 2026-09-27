<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use InvalidArgumentException;
use JsonException;
use PDO;
use UnexpectedValueException;

final class MediaRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function create(
        string $source,
        string $mediaType,
        string $sourceId,
        string $title,
        array $metadata,
    ): string {
        if (array_is_list($metadata) && $metadata !== []) {
            throw new InvalidArgumentException('Metadata must be an object.');
        }

        $statement = $this->connection->prepare(<<<'SQL'
INSERT INTO media (source, media_type, source_id, title, metadata)
VALUES (:source, :media_type, :source_id, :title, :metadata)
SQL);
        $statement->execute([
            'source' => $source,
            'media_type' => $mediaType,
            'source_id' => $sourceId,
            'title' => $title,
            'metadata' => json_encode((object) $metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        return $this->connection->lastInsertId();
    }

    public function findById(string $id): ?array
    {
        $statement = $this->connection->prepare(<<<'SQL'
SELECT id, source, media_type, source_id, title, metadata, created_at, updated_at
FROM media WHERE id = :id
SQL);
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        try {
            $metadata = json_decode($row['metadata'], true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('Stored media metadata is invalid.', previous: $exception);
        }

        if (!is_array($metadata)) {
            throw new UnexpectedValueException('Stored media metadata must be an object.');
        }

        $row['id'] = (string) $row['id'];
        $row['metadata'] = $metadata;

        return $row;
    }
}
