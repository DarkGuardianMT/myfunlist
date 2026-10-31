<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use JsonException;
use MyFunList\Http\ApiException;
use Throwable;

final class OpenLibraryPilot
{
    private const MAX_BYTES = 2097152;

    public function __construct(
        private readonly ProviderHttpClient $http,
        private readonly bool $enabled,
        private readonly bool $sharedBudgetConfirmed,
        private readonly string $stateFile,
        private readonly string $userAgent,
    ) {
    }

    public static function fromEnvironment(ProviderHttpClient $http): self
    {
        $value = static function (string $key): string {
            $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
            return is_string($value) ? $value : '';
        };
        return new self($http, $value('OPEN_LIBRARY_PILOT_ENABLED') === 'true',
            $value('OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED') === 'true',
            $value('OPEN_LIBRARY_STATE_FILE'), $value('OPEN_LIBRARY_USER_AGENT'));
    }

    public function search(array $parameters): array
    {
        if (!$this->enabled) throw new ApiException(404, 'not_found', 'Route not found.');
        $query = OpenLibraryQuery::fromParameters($parameters);
        if (!$this->sharedBudgetConfirmed || strlen($this->userAgent) > 200
            || preg_match('/[^\x20-\x7E]/', $this->userAgent) === 1
            || preg_match('/^MyFunList[^\r\n]*\([A-Za-z0-9.!#$%&\x27*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)$/D', $this->userAgent) !== 1) {
            throw self::unavailable();
        }
        $path = realpath($this->stateFile);
        if ($path === false || !is_file($path) || is_link($this->stateFile)
            || $this->stateFile !== $path || !is_writable($path)) throw self::unavailable();
        foreach ([dirname(__DIR__, 2) . '/public', $_SERVER['DOCUMENT_ROOT'] ?? ''] as $root) {
            $root = $root !== '' ? realpath($root) : false;
            if ($root !== false && str_starts_with(strtolower(str_replace('\\', '/', $path)),
                strtolower(str_replace('\\', '/', $root)) . '/')) throw self::unavailable();
        }
        if (PHP_OS_FAMILY !== 'Windows' && (fileperms($path) & 0007) !== 0) throw self::unavailable();
        $handle = @fopen($path, 'r+b');
        if ($handle === false) throw self::unavailable();
        try {
            // Dezelfde inode blijft bestaan; vervang of verwijder dit bestand nooit tijdens gebruik.
            if (!flock($handle, LOCK_EX | LOCK_NB)) throw self::unavailable();
            $state = $this->readState($handle);
            $now = microtime(true);
            $state['cache'] = array_filter($state['cache'], static fn (array $entry): bool => $entry['expiresAt'] > $now);
            $key = hash('sha256', 'v1:' . json_encode([$query->providerParameters(), $query->languageMode], JSON_THROW_ON_ERROR));
            if (isset($state['cache'][$key])) {
                $entry = $state['cache'][$key];
                unset($state['cache'][$key]);
                $state['cache'][$key] = $entry;
                $this->writeState($handle, $state);
                return $entry['data'];
            }
            if ($now < $state['nextRequestAt']) throw self::unavailable();

            // Schrijf de reservering voor I/O: een gecrashte worker laat een veilige afkoelperiode achter.
            $state['nextRequestAt'] = $now + 60;
            $this->writeState($handle, $state);
            try {
                $data = (new OpenLibraryAdapter($this->http, $this->userAgent))->search($query);
            } catch (Throwable $exception) {
                $state['nextRequestAt'] = microtime(true) + 60;
                $this->writeState($handle, $state);
                throw $exception;
            }
            $state['nextRequestAt'] = max($now + 1.1, microtime(true));
            $state['cache'][$key] = ['expiresAt' => microtime(true) + 300, 'data' => $data];
            while (count($state['cache']) > 20 || strlen(json_encode($state, JSON_THROW_ON_ERROR)) > self::MAX_BYTES) {
                unset($state['cache'][array_key_first($state['cache'])]);
            }
            $this->writeState($handle, $state);
            return $data;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function readState(mixed $handle): array
    {
        $raw = stream_get_contents($handle, self::MAX_BYTES + 1);
        try {
            $state = is_string($raw) && strlen($raw) <= self::MAX_BYTES ? json_decode($raw, true, 64, JSON_THROW_ON_ERROR) : null;
        } catch (JsonException) {
            throw self::unavailable();
        }
        if (!is_array($state) || ($state['version'] ?? null) !== 1
            || !is_numeric($state['nextRequestAt'] ?? null) || !is_finite((float) $state['nextRequestAt'])
            || $state['nextRequestAt'] < 0 || !is_array($state['cache'] ?? null) || count($state['cache']) > 20) {
            throw self::unavailable();
        }
        foreach ($state['cache'] as $key => $entry) {
            if (!is_string($key) || preg_match('/^[a-f0-9]{64}$/D', $key) !== 1 || !is_array($entry)
                || !is_numeric($entry['expiresAt'] ?? null) || !is_array($entry['data'] ?? null)
                || ($entry['data']['provider'] ?? null) !== 'open-library' || !is_array($entry['data']['items'] ?? null)) {
                throw self::unavailable();
            }
        }
        return $state;
    }

    private function writeState(mixed $handle, array $state): void
    {
        $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        if (!rewind($handle) || fwrite($handle, $json) !== strlen($json) || !ftruncate($handle, strlen($json))
            || !fflush($handle) || !fsync($handle)) throw self::unavailable();
    }

    private static function unavailable(): ProviderException
    {
        return new ProviderException(503, 'provider_unavailable', 'Book search pilot is temporarily unavailable.');
    }
}
