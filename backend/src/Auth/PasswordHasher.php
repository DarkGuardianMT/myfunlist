<?php

declare(strict_types=1);

namespace MyFunList\Auth;

final class PasswordHasher
{
    private readonly string $algorithm;

    public function __construct()
    {
        $argon2id = defined('PASSWORD_ARGON2ID') ? constant('PASSWORD_ARGON2ID') : null;
        $this->algorithm = $argon2id !== null && in_array($argon2id, password_algos(), true)
            ? $argon2id
            : PASSWORD_DEFAULT;
    }

    public function acceptsLength(string $password): bool
    {
        $characters = preg_match_all('/./us', $password);

        return $characters !== false
            && $characters >= 12
            && $characters <= 128
            && ($this->algorithm !== PASSWORD_DEFAULT || strlen($password) <= 72);
    }

    public function hash(string $password): string
    {
        return password_hash($password, $this->algorithm);
    }

    public function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, $this->algorithm);
    }
}
