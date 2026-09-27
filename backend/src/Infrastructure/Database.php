<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use MyFunList\Config;
use PDO;
use PDOException;

final class Database
{
    public function check(): void
    {
        try {
            $this->connect()->query('SELECT 1');
        } catch (PDOException $exception) {
            throw new DatabaseUnavailable(previous: $exception);
        }
    }

    public function connect(): PDO
    {
        $config = Config::database();
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'],
            $config['port'],
            $config['database'],
        );

        try {
            $connection = new PDO($dsn, $config['username'], $config['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $connection->exec("SET time_zone = '+00:00'");

            return $connection;
        } catch (PDOException $exception) {
            throw new DatabaseUnavailable(previous: $exception);
        }
    }
}
