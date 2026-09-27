<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use MyFunList\Auth\DuplicateEmail;
use PDO;
use PDOException;

final class UserRepository
{
    private ?PDO $connection = null;

    public function __construct(private readonly Database $database)
    {
    }

    public function findByEmail(string $email): ?array
    {
        $statement = $this->connection()->prepare(
            'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1',
        );
        $statement->execute([$email]);
        $user = $statement->fetch();

        if ($user === false) {
            return null;
        }

        $user['id'] = (string) $user['id'];

        return $user;
    }

    public function findById(string $id): ?array
    {
        $statement = $this->connection()->prepare('SELECT id, email FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$id]);
        $user = $statement->fetch();

        if ($user === false) {
            return null;
        }

        $user['id'] = (string) $user['id'];

        return $user;
    }

    public function create(string $email, string $passwordHash): array
    {
        $statement = $this->connection()->prepare(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        );

        try {
            $statement->execute([$email, $passwordHash]);
        } catch (PDOException $exception) {
            if ((int) ($exception->errorInfo[1] ?? 0) === 1062) {
                throw new DuplicateEmail(previous: $exception);
            }

            throw $exception;
        }

        return ['id' => $this->connection()->lastInsertId(), 'email' => $email];
    }

    public function updatePasswordHash(string $id, string $passwordHash): void
    {
        $statement = $this->connection()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $statement->execute([$passwordHash, $id]);
    }

    private function connection(): PDO
    {
        return $this->connection ??= $this->database->connect();
    }
}
