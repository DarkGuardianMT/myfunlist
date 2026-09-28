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
        $statement = $this->connection()->prepare(
            'SELECT id, email, display_name, created_at FROM users WHERE id = ? LIMIT 1',
        );
        $statement->execute([$id]);
        $user = $statement->fetch();

        if ($user === false) {
            return null;
        }

        $user['id'] = (string) $user['id'];

        return self::publicUser($user);
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

        return $this->findById((string) $this->connection()->lastInsertId());
    }

    public function updateDisplayName(string $id, ?string $displayName): void
    {
        $statement = $this->connection()->prepare('UPDATE users SET display_name = ? WHERE id = ?');
        $statement->execute([$displayName, $id]);
    }

    public function passwordHashForId(string $id): ?string
    {
        $statement = $this->connection()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$id]);
        $hash = $statement->fetchColumn();

        return is_string($hash) ? $hash : null;
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

    private static function publicUser(array $row): array
    {
        $createdAt = new \DateTimeImmutable($row['created_at'], new \DateTimeZone('UTC'));

        return [
            'id' => (string) $row['id'],
            'email' => $row['email'],
            'displayName' => $row['display_name'],
            'createdAt' => $createdAt->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }
}
