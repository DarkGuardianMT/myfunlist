<?php

declare(strict_types=1);

namespace MyFunList\RateLimit;

use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\DatabaseUnavailable;
use PDO;
use PDOException;

final class RateLimiter
{
    private const TEST_SECRET = 'myfunlist-test-only-rate-limit-secret-never-use-in-production';

    public function __construct(
        private readonly Database $database,
        private readonly array $policies,
        private readonly ?string $secret = null,
        private readonly ?\Closure $clock = null,
    ) {
    }

    public function check(string $policy, string $subject): ?int
    {
        $settings = $this->policies[$policy] ?? null;
        if (!is_array($settings) || !is_int($settings['limit'] ?? null)
            || !is_int($settings['window'] ?? null) || $settings['limit'] < 1
            || $settings['window'] < 1) {
            throw new RateLimitUnavailable('Invalid rate limit policy.');
        }

        $secret = $this->secret ?? $this->configuredSecret();
        $now = ($this->clock ?? static fn (): int => time())();
        $start = intdiv($now, $settings['window']) * $settings['window'];
        $end = $start + $settings['window'];
        $hash = hash_hmac('sha256', $policy . ':' . $subject, $secret);

        try {
            $connection = $this->database->connect();
            // De unieke sleutel en atomaire upsert delen de teller veilig tussen PHP-processen.
            $increment = $connection->prepare(<<<'SQL'
INSERT INTO rate_limit_counters (policy, subject_hash, window_start, request_count, expires_at)
VALUES (?, ?, ?, 1, ?)
ON DUPLICATE KEY UPDATE request_count = LEAST(request_count + 1, 4294967295)
SQL);
            $increment->execute([$policy, $hash, $start, gmdate('Y-m-d H:i:s', $end)]);
            $select = $connection->prepare(<<<'SQL'
SELECT request_count FROM rate_limit_counters
WHERE policy = ? AND subject_hash = ? AND window_start = ?
SQL);
            $select->execute([$policy, $hash, $start]);
            $storedCount = $select->fetchColumn();
            if ($storedCount === false) {
                throw new RateLimitUnavailable('Rate limit counter unavailable.');
            }
            $count = (int) $storedCount;

            if (random_int(1, 20) === 1) {
                $this->cleanup($connection, $now);
            }

            return $count > $settings['limit'] ? max(1, $end - $now) : null;
        } catch (PDOException|DatabaseUnavailable $exception) {
            throw new RateLimitUnavailable('Rate limit storage unavailable.', previous: $exception);
        }
    }

    public function cleanup(PDO $connection, int $now): void
    {
        // Een begrensde opruimstap voorkomt langdurige vergrendeling bij veel verlopen vensters.
        $delete = $connection->prepare(<<<'SQL'
DELETE FROM rate_limit_counters WHERE expires_at <= ? ORDER BY expires_at LIMIT 100
SQL);
        $delete->execute([gmdate('Y-m-d H:i:s', $now)]);
    }

    private function configuredSecret(): string
    {
        $value = $_ENV['RATE_LIMIT_SECRET'] ?? $_SERVER['RATE_LIMIT_SECRET'] ?? getenv('RATE_LIMIT_SECRET');
        if (is_string($value) && strlen($value) >= 32) {
            return $value;
        }
        $environment = $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV');
        if ($environment === 'testing') {
            return self::TEST_SECRET;
        }
        throw new RateLimitUnavailable('Rate limit secret is unavailable.');
    }
}
