<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use MyFunList\Http\ApiException;
use MyFunList\RateLimit\OpenLibraryClientLimiter;
use MyFunList\RateLimit\OpenLibraryClientLimitExceeded;
use Throwable;

final class OpenLibraryPilot
{
    private const FAILURE_COOLDOWN_SECONDS = 60;
    // Acht seconden HTTP plus korte voltooiing; uitsluitend een hint voor handmatig opnieuw proberen.
    private const RECENT_RESERVATION_SECONDS = 10;

    public function __construct(
        private readonly ProviderHttpClient $http,
        private readonly bool $enabled,
        private readonly bool $sharedBudgetConfirmed,
        private readonly OpenLibraryStateStore $store,
        private readonly string $userAgent,
        private readonly string $clientSecret = '',
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
            new OpenLibraryStateStore(), $value('OPEN_LIBRARY_USER_AGENT'), $value('RATE_LIMIT_SECRET'));
    }

    public function search(array $parameters): array
    {
        if (!$this->enabled) throw new ApiException(404, 'not_found', 'Route not found.');
        if (!$this->sharedBudgetConfirmed || strlen($this->userAgent) > 200
            || preg_match('/[^\x20-\x7E]/', $this->userAgent) === 1
            || preg_match('/^MyFunList[^\r\n]*\([A-Za-z0-9.!#$%&\x27*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)$/D', $this->userAgent) !== 1) {
            throw self::unavailable();
        }
        $decision = $this->store->transaction(function (array &$state, float $now) use ($parameters): array {
            try {
                (new OpenLibraryClientLimiter($this->clientSecret))->admit($state['clients'], $_SERVER['REMOTE_ADDR'] ?? null, $now);
                $query = OpenLibraryQuery::fromParameters($parameters);
            } catch (ApiException|OpenLibraryClientLimitExceeded $exception) {
                // Ook ongeldige zoekopdrachten verbruiken hun reeds toegekende clienttoelating.
                return ['error' => $exception];
            }
            $state['cache'] = array_filter($state['cache'], static fn (array $entry): bool => $entry['expiresAt'] > $now);
            $key = hash('sha256', 'v1:' . json_encode([$query->providerParameters(), $query->languageMode], JSON_THROW_ON_ERROR));
            if (isset($state['cache'][$key])) {
                $entry = $state['cache'][$key];
                unset($state['cache'][$key]);
                $state['cache'][$key] = $entry;
                return ['data' => $entry['data']];
            }
            // Een verlopen tijdstip bewijst niet dat een gepauzeerde worker nooit meer HTTP start.
            if ($state['reservation'] !== null) {
                // De oorspronkelijke deadline blijft gelijk; nieuwe toelatingen verjongen de reservering niet.
                $age = $now - ($state['nextRequestAt'] - self::FAILURE_COOLDOWN_SECONDS);
                return ['error' => $age >= 0 && $age < self::RECENT_RESERVATION_SECONDS
                    ? OpenLibraryStateStore::busy() : self::unavailable()];
            }
            if ($now < $state['nextRequestAt']) {
                return ['error' => $state['nextRequestAt'] - $now <= 1.100001
                    ? OpenLibraryStateStore::busy() : self::unavailable()];
            }
            $token = bin2hex(random_bytes(32));
            $state['reservation'] = $token;
            $state['nextRequestAt'] = $now + self::FAILURE_COOLDOWN_SECONDS;
            return ['token' => $token, 'key' => $key, 'query' => $query];
        });
        if (isset($decision['error'])) throw $decision['error'];
        if (isset($decision['data'])) return $decision['data'];

        // De reservering is bevestigd; tijdens externe HTTP staat geen transactie open.
        try {
            $data = (new OpenLibraryAdapter($this->http, $this->userAgent))->search($decision['query']);
        } catch (Throwable $exception) {
            $this->finish($decision, null);
            throw $exception;
        }
        $this->finish($decision, $data);
        return $data;
    }

    private function finish(array $decision, ?array $data): void
    {
        $this->store->transaction(static function (array &$state, float $now) use ($decision, $data): void {
            if ($state['reservation'] !== $decision['token']) throw self::unavailable();
            $state['reservation'] = null;
            // Meten na voltooiing sluit ook de commit-naar-HTTP-pauze veilig uit.
            $state['nextRequestAt'] = $now + ($data === null ? self::FAILURE_COOLDOWN_SECONDS : 1.1);
            if ($data !== null) {
                $state['cache'][$decision['key']] = ['expiresAt' => $now + 300, 'data' => $data];
            }
        }, completion: true);
    }

    private static function unavailable(): ProviderException
    {
        return OpenLibraryStateStore::unavailable();
    }
}
