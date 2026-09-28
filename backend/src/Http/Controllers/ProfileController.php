<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Auth\ProfileService;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\Infrastructure\PhpSession;

final class ProfileController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(
        private readonly ProfileService $profiles,
        private readonly PhpSession $session,
    ) {
    }

    public function show(AuthenticatedUser $identity): JsonResponse
    {
        return JsonResponse::data(['user' => $this->profiles->profile($identity)], headers: self::NO_STORE);
    }

    public function update(AuthenticatedUser $identity): JsonResponse
    {
        $user = $this->profiles->updateDisplayName($identity, JsonRequest::body());

        return JsonResponse::data(['user' => $user], headers: self::NO_STORE);
    }

    public function changePassword(AuthenticatedUser $identity): JsonResponse
    {
        $this->profiles->changePassword($identity, JsonRequest::body());
        $this->session->renewAuthenticatedSession();

        return JsonResponse::noContent();
    }
}
