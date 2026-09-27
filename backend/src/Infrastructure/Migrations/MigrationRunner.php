<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure\Migrations;

use PDO;
use RuntimeException;
use Throwable;

final class MigrationRunner
{
    public function __construct(
        private readonly PDO $connection,
        private readonly string $directory,
        string $expectedDatabase,
    ) {
        $actualDatabase = $this->connection->query('SELECT DATABASE()')->fetchColumn();

        if ($actualDatabase !== $expectedDatabase || in_array($actualDatabase, [
            'information_schema', 'mysql', 'performance_schema', 'sys',
        ], true)) {
            throw new RuntimeException('Migration target does not match the configured application database.');
        }
    }

    public function status(): array
    {
        $applied = $this->appliedVersions();
        $status = [];

        foreach ($this->files() as $version => $path) {
            $status[$version] = isset($applied[$version]) ? 'applied' : 'pending';
        }

        return $status;
    }

    public function migrate(): array
    {
        $files = $this->files();

        $this->connection->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(191) NOT NULL PRIMARY KEY,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $results = [];
        $applied = $this->appliedVersions();

        foreach ($files as $version => $path) {
            if (isset($applied[$version])) {
                $results[$version] = 'already applied';
                continue;
            }

            try {
                $statements = require $path;
                if (!is_array($statements) || $statements === []) {
                    throw new RuntimeException('Migration must return SQL statements.');
                }

                foreach ($statements as $statement) {
                    if (!is_string($statement) || trim($statement) === '') {
                        throw new RuntimeException('Migration contains an invalid statement.');
                    }

                    $this->connection->exec($statement);
                }

                $record = $this->connection->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
                $record->execute([$version]);
                $results[$version] = 'applied';
            } catch (Throwable $exception) {
                throw new RuntimeException(
                    "Migration {$version} failed. DDL may be partially applied; inspect the database before retrying.",
                    previous: $exception,
                );
            }
        }

        return $results;
    }

    private function files(): array
    {
        $paths = glob($this->directory . '/*.php');
        if ($paths === false || $paths === []) {
            throw new RuntimeException('No migration files found.');
        }

        sort($paths, SORT_STRING);
        $files = [];

        foreach ($paths as $path) {
            $version = pathinfo($path, PATHINFO_FILENAME);
            if (!preg_match('/^[0-9]{3}_[a-z0-9_]+$/', $version)) {
                throw new RuntimeException('Invalid migration filename.');
            }

            $files[$version] = $path;
        }

        return $files;
    }

    private function appliedVersions(): array
    {
        $tableExists = $this->connection->query(<<<'SQL'
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
SQL)->fetchColumn();

        if ((int) $tableExists === 0) {
            return [];
        }

        return array_fill_keys(
            $this->connection->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN),
            true,
        );
    }
}
