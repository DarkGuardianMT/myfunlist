<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Auth\AuthService;
use MyFunList\Http\ApiException;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\Infrastructure\PhpSession;

final class AuthController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(
        private readonly AuthService $auth,
        private readonly PhpSession $session,
    ) {
    }

    public function csrf(): JsonResponse
    {
        return JsonResponse::data(['csrfToken' => $this->session->csrfToken()], headers: self::NO_STORE);
    }

    public function register(): JsonResponse
    {
        $user = $this->auth->register(JsonRequest::body());
        $this->session->authenticate($user['id']);

        return JsonResponse::data(['user' => $user], 201, self::NO_STORE);
    }

    public function login(): JsonResponse
    {
        $user = $this->auth->login(JsonRequest::body());
        $this->session->authenticate($user['id']);

        return JsonResponse::data(['user' => $user], headers: self::NO_STORE);
    }

    public function me(AuthenticatedUser $identity): JsonResponse
    {
        $user = $this->auth->findById($identity);
        if ($user === null) {
            throw new ApiException(401, 'unauthenticated', 'Authentication required.');
        }

        return JsonResponse::data(['user' => $user], headers: self::NO_STORE);
    }

    public function logout(AuthenticatedUser $identity): JsonResponse
    {
        $this->session->logout();

        return JsonResponse::noContent();
    }
}
