<?php

declare(strict_types=1);

namespace MyFunList\Http\Middleware;

use Closure;
use MyFunList\Auth\CurrentUserProvider;
use MyFunList\Http\JsonResponse;
use MyFunList\Infrastructure\PhpSession;

final class AuthMiddleware
{
    public function __construct(
        private readonly PhpSession $session,
        private readonly CurrentUserProvider $currentUsers,
    ) {
    }

    public function csrf(callable $next): Closure
    {
        return function (...$arguments) use ($next): JsonResponse {
            $candidate = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
            if (!$this->session->validCsrf(is_string($candidate) ? $candidate : null)) {
                return JsonResponse::error(403, 'invalid_csrf', 'Invalid CSRF token.');
            }

            return $next(...$arguments);
        };
    }

    public function requireUser(callable $next): Closure
    {
        return function (...$arguments) use ($next): JsonResponse {
            $identity = $this->currentUsers->currentUser();
            if ($identity === null) {
                return JsonResponse::error(401, 'unauthenticated', 'Authentication required.');
            }

            return $next($identity, ...$arguments);
        };
    }
}
