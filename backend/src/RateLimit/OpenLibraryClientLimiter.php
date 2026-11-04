<?php

declare(strict_types=1);

namespace MyFunList\RateLimit;

final class OpenLibraryClientLimiter
{
    public const LIMIT = 5;
    public const WINDOW_SECONDS = 60;
    public const MAX_CLIENTS = 1024;

    public function __construct(private readonly string $secret)
    {
    }

    // De aanroeper houdt de gedeelde rijvergrendeling vast en commit toelating vóór provider-I/O.
    public function admit(array &$clients, mixed $remoteAddress, float $now): void
    {
        if (strlen($this->secret) < 32 || !is_finite($now) || $now < 0 || !is_string($remoteAddress)
            || filter_var($remoteAddress, FILTER_VALIDATE_IP) === false || count($clients) > self::MAX_CLIENTS) {
            throw new RateLimitUnavailable('Client admission is unavailable.');
        }
        $address = inet_pton($remoteAddress);
        if ($address === false) throw new RateLimitUnavailable('Client admission is unavailable.');
        // IPv4 en de overeenkomstige IPv4-mapped IPv6-notatie delen dezelfde teller.
        if (strlen($address) === 16 && str_starts_with($address, str_repeat("\0", 10) . "\xff\xff")) {
            $address = substr($address, 12);
        }
        $key = hash_hmac('sha256', 'open-library-client:' . $address, $this->secret);
        foreach ($clients as $client => $timestamps) {
            if (!is_string($client) || preg_match('/^[a-f0-9]{64}$/D', $client) !== 1
                || !is_array($timestamps) || !array_is_list($timestamps)
                || count($timestamps) < 1 || count($timestamps) > self::LIMIT) {
                throw new RateLimitUnavailable('Client admission state is invalid.');
            }
            $previous = 0;
            foreach ($timestamps as $timestamp) {
                if ((!is_int($timestamp) && !is_float($timestamp)) || !is_finite((float) $timestamp)
                    || $timestamp < $previous || $timestamp > $now) {
                    throw new RateLimitUnavailable('Client admission state is invalid.');
                }
                $previous = $timestamp;
            }
            $active = array_values(array_filter($timestamps, static fn (int|float $timestamp): bool => $timestamp > $now - self::WINDOW_SECONDS));
            if ($active === []) unset($clients[$client]);
            else $clients[$client] = $active;
        }
        $timestamps = $clients[$key] ?? [];
        if (count($timestamps) >= self::LIMIT) {
            throw new OpenLibraryClientLimitExceeded((int) ceil($timestamps[0] + self::WINDOW_SECONDS - $now));
        }
        if ($timestamps === [] && count($clients) >= self::MAX_CLIENTS) {
            // Verwijder nooit een nog actieve teller om ruimte voor een nieuwe client te maken.
            throw new RateLimitUnavailable('Client admission capacity is unavailable.');
        }
        $clients[$key] = [...$timestamps, $now];
    }
}
