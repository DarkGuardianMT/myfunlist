<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use Closure;
use MyFunList\Infrastructure\Database;
use PDO;
use PDOException;
use Throwable;

final class OpenLibraryStateStore
{
    public const MAX_BYTES = 2097152;

    public function __construct(private readonly ?Closure $connect = null)
    {
    }

    public function transaction(Closure $operation, bool $completion = false): mixed
    {
        $connection = null;
        $ownsTransaction = false;
        try {
            $connection = ($this->connect ?? static fn (): PDO => (new Database())->connect(3))();
            if ($connection->inTransaction()) throw new \RuntimeException('Unexpected transaction.');
            // NOWAIT begrenst rijcontentie; deze sessielimiet begrenst metadata-locks.
            $connection->exec('SET SESSION lock_wait_timeout = 1');
            if ($completion) $connection->exec('SET SESSION innodb_lock_wait_timeout = 1');
            $connection->beginTransaction();
            $ownsTransaction = true;
            // Voltooiing mag kort wachten om een blijvende blokkade door gewone toelatingscontentie te vermijden.
            $raw = $connection->query('SELECT state_json FROM open_library_state WHERE id = 1 FOR UPDATE'
                . ($completion ? '' : ' NOWAIT'))->fetchColumn();
            $state = self::decode($raw);
            // Lees de gedeelde klok pas na het verkrijgen van de rijvergrendeling.
            $now = (float) $connection->query('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(6))')->fetchColumn();
            if (!is_finite($now) || $now <= 0 || $now < $state['updatedAt']) throw new \RuntimeException('Invalid database clock.');
            $result = $operation($state, $now);
            $state['updatedAt'] = $now;
            $json = self::encode($state);
            $connection->prepare('UPDATE open_library_state SET state_json = ? WHERE id = 1')->execute([$json]);
            if (!$connection->commit()) throw new \RuntimeException('Commit failed.');
            return $result;
        } catch (Throwable $exception) {
            try {
                if ($ownsTransaction && $connection?->inTransaction()) $connection->rollBack();
            } catch (Throwable) {
                // Een onzekere commit wordt nooit opnieuw uitgevoerd en start nooit provider-I/O.
            }
            if ($exception instanceof \MyFunList\RateLimit\RateLimitUnavailable) throw $exception;
            if ($exception instanceof PDOException && in_array((int) ($exception->errorInfo[1] ?? 0), [1205, 1213, 3572], true)) {
                throw self::busy();
            }
            throw self::unavailable();
        }
    }

    private static function decode(mixed $raw): array
    {
        if (!is_string($raw) || strlen($raw) > self::MAX_BYTES) throw self::unavailable();
        $state = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($state) || ($state['version'] ?? null) !== 3 || !is_array($state['clients'] ?? null)
            || !is_array($state['cache'] ?? null) || count($state['cache']) > 20
            || !array_key_exists('reservation', $state)
            || ($state['reservation'] !== null && (!is_string($state['reservation'])
                || preg_match('/^[a-f0-9]{64}$/D', $state['reservation']) !== 1))) throw self::unavailable();
        foreach (['nextRequestAt', 'updatedAt'] as $field) {
            if ((!is_int($state[$field] ?? null) && !is_float($state[$field] ?? null))
                || !is_finite((float) $state[$field]) || $state[$field] < 0) throw self::unavailable();
        }
        foreach ($state['cache'] as $key => $entry) {
            if (!is_string($key) || preg_match('/^[a-f0-9]{64}$/D', $key) !== 1 || !is_array($entry)
                || (!is_int($entry['expiresAt'] ?? null) && !is_float($entry['expiresAt'] ?? null))
                || !is_finite((float) $entry['expiresAt']) || $entry['expiresAt'] < 0
                || !is_array($entry['data'] ?? null) || ($entry['data']['provider'] ?? null) !== 'open-library'
                || !is_array($entry['data']['items'] ?? null)) throw self::unavailable();
        }
        return $state;
    }

    private static function encode(array &$state): string
    {
        $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        while (count($state['cache']) > 20 || strlen($json) > self::MAX_BYTES) {
            if ($state['cache'] === []) throw self::unavailable();
            unset($state['cache'][array_key_first($state['cache'])]);
            $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        }
        return $json;
    }

    public static function unavailable(): ProviderException
    {
        return new ProviderException(503, 'provider_unavailable', 'Book search pilot is temporarily unavailable.');
    }

    public static function busy(): ProviderException
    {
        return new ProviderException(503, 'provider_busy', 'Book search is busy. Please wait before retrying.');
    }
}
