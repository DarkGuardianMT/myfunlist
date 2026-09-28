<?php

declare(strict_types=1);

namespace MyFunList\Auth;

use MyFunList\Http\ApiException;
use MyFunList\Infrastructure\UserRepository;

final class ProfileService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly PasswordHasher $passwords,
    ) {
    }

    public function profile(AuthenticatedUser $identity): array
    {
        return $this->users->findById($identity->id)
            ?? throw new ApiException(401, 'unauthenticated', 'Authentication required.');
    }

    public function updateDisplayName(AuthenticatedUser $identity, array $input): array
    {
        if (!array_key_exists('displayName', $input) || array_diff(array_keys($input), ['displayName']) !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                'displayName' => 'Supply only a display name.',
            ]);
        }

        $name = $input['displayName'];
        if ($name !== null) {
            if (!is_string($name)) {
                $name = false;
            } else {
                $name = preg_replace('/^\s+|\s+$/u', '', $name);
            }
            if (!is_string($name) || $name === '' || preg_match('/\p{C}/u', $name) !== 0
                || preg_match_all('/./us', $name) > 80) {
                throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                    'displayName' => 'Use 1 to 80 characters without control characters, or clear the name.',
                ]);
            }
        }

        $this->users->updateDisplayName($identity->id, $name);

        return $this->profile($identity);
    }

    public function changePassword(AuthenticatedUser $identity, array $input): void
    {
        if (array_diff(array_keys($input), ['currentPassword', 'newPassword']) !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                'password' => 'Supply only current and new passwords.',
            ]);
        }
        $current = $input['currentPassword'] ?? null;
        $new = $input['newPassword'] ?? null;
        $fields = [];
        if (!is_string($current) || $current === '') {
            $fields['currentPassword'] = 'Enter your current password.';
        }
        if (!is_string($new) || !$this->passwords->acceptsLength($new)) {
            $fields['newPassword'] = 'Use a password between 12 and 128 characters.';
        }
        if ($fields !== []) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', $fields);
        }

        $hash = $this->users->passwordHashForId($identity->id);
        if ($hash === null) {
            throw new ApiException(401, 'unauthenticated', 'Authentication required.');
        }
        if (!$this->passwords->verify($current, $hash)) {
            throw new ApiException(422, 'validation_error', 'Check the supplied fields.', [
                'currentPassword' => 'Current password is incorrect.',
            ]);
        }

        $this->users->updatePasswordHash($identity->id, $this->passwords->hash($new));
    }
}
