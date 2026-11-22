<?php

declare(strict_types=1);

namespace MyFunList\Provider;

final class OpenLibraryAccess
{
    private function __construct(
        public readonly bool $enabled,
        public readonly bool $public,
    ) {
    }

    public static function fromEnvironment(): self
    {
        $value = static fn (string $key): mixed => $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
        return new self($value('OPEN_LIBRARY_PILOT_ENABLED') === 'true',
            $value('OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED') === 'true');
    }

    public function isTester(string $userId): bool
    {
        // Alleen exacte account-ID's; ongeldige configuratie weigert alle testers.
        $testers = $_ENV['OPEN_LIBRARY_TESTER_USER_IDS'] ?? $_SERVER['OPEN_LIBRARY_TESTER_USER_IDS'] ?? getenv('OPEN_LIBRARY_TESTER_USER_IDS');
        return is_string($testers) && strlen($testers) <= 419
            && preg_match('/^[1-9][0-9]{0,19}(?:,[1-9][0-9]{0,19}){0,19}$/D', $testers) === 1
            && in_array($userId, explode(',', $testers), true);
    }
}
