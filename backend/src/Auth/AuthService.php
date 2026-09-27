<?php

declare(strict_types=1);

namespace MyFunList\Auth;

use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\UserRepository;

final class AuthService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly PasswordHasher $passwords,
    ) {
    }

    public function register(array $input): array
    {
        $email = self::normalizeEmail($input['email'] ?? null);
        $password = $input['password'] ?? null;
        $fields = [];

        if ($email === null) {
            $fields['email'] = 'Enter a valid email address.';
        }
        if (!is_string($password) || !$this->passwords->acceptsLength($password)) {
            $fields['password'] = 'Use a password between 12 and 128 characters.';
        }
        if ($fields !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', $fields);
        }

        if ($this->users->findByEmail($email) !== null) {
            throw new ApiException(409, 'email_in_use', 'This email address is already registered.');
        }

        try {
            return $this->users->create($email, $this->passwords->hash($password));
        } catch (DuplicateEmail) {
            throw new ApiException(409, 'email_in_use', 'This email address is already registered.');
        }
    }

    public function login(array $input): array
    {
        $email = self::normalizeEmail($input['email'] ?? null);
        $password = $input['password'] ?? null;

        if ($email === null || !is_string($password)) {
            throw new ApiException(401, 'invalid_credentials', 'Invalid email or password.');
        }

        $user = $this->users->findByEmail($email);
        if ($user === null || !$this->passwords->verify($password, $user['password_hash'])) {
            throw new ApiException(401, 'invalid_credentials', 'Invalid email or password.');
        }

        if ($this->passwords->needsRehash($user['password_hash'])) {
            $this->users->updatePasswordHash($user['id'], $this->passwords->hash($password));
        }

        return ['id' => $user['id'], 'email' => $user['email']];
    }

    public function findById(AuthenticatedUser $identity): ?array
    {
        return $this->users->findById($identity->id);
    }

    private static function normalizeEmail(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $email = strtolower(trim($value));

        return $email !== ''
            && strlen($email) <= 254
            && preg_match('/^[\x00-\x7F]+$/D', $email) === 1
            && filter_var($email, FILTER_VALIDATE_EMAIL) !== false
                ? $email
                : null;
    }
}
