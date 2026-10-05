<?php

declare(strict_types=1);

namespace MyFunList\Http\Middleware;

use Closure;
use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Auth\AuthService;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\RateLimit\RateLimiter;

final class RateLimitMiddleware
{
    public function __construct(private readonly RateLimiter $limiter)
    {
    }

    public function ip(string $policy, callable $next): Closure
    {
        return function (...$arguments) use ($policy, $next): JsonResponse {
            $address = $_SERVER['REMOTE_ADDR'] ?? '';
            $blocked = $this->limiter->check($policy, is_string($address) ? $address : '');

            return $blocked === null ? $next(...$arguments) : self::blocked($blocked);
        };
    }

    public function login(callable $next): Closure
    {
        return function (...$arguments) use ($next): JsonResponse {
            $address = $_SERVER['REMOTE_ADDR'] ?? '';
            $ipRetry = $this->limiter->check('login_ip', is_string($address) ? $address : '');
            $input = JsonRequest::body();
            $email = AuthService::normalizeEmail($input['email'] ?? null);
            $accountRetry = $email === null ? null : $this->limiter->check('login_account', $email);
            $retry = max($ipRetry ?? 0, $accountRetry ?? 0);

            return $retry > 0 ? self::blocked($retry) : $next(...$arguments);
        };
    }

    public function user(string $policy, callable $next): Closure
    {
        return function (AuthenticatedUser $user, ...$arguments) use ($policy, $next): JsonResponse {
            $blocked = $this->limiter->check($policy, $user->id);

            return $blocked === null ? $next($user, ...$arguments) : self::blocked($blocked);
        };
    }

    private static function blocked(int $seconds): JsonResponse
    {
        return JsonResponse::error(429, 'rate_limited', 'Too many requests. Please try again later.',
            ['Retry-After' => (string) $seconds, 'Cache-Control' => 'no-store']);
    }
}
