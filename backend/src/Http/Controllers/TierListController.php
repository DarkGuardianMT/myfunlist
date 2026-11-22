<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\TierLists\TierListService;

final class TierListController
{
    public function __construct(private readonly TierListService $boards)
    {
    }

    public function all(AuthenticatedUser $user): JsonResponse
    {
        return JsonResponse::data($this->boards->all($user, $_GET));
    }

    public function create(AuthenticatedUser $user): JsonResponse
    {
        $result = $this->boards->create($user, JsonRequest::body(8192, 413), $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? null);
        return JsonResponse::data($result['board'], $result['created'] ? 201 : 200);
    }

    public function show(AuthenticatedUser $user, string $id): JsonResponse
    {
        return JsonResponse::data($this->boards->get($user, $id));
    }

    public function save(AuthenticatedUser $user, string $id): JsonResponse
    {
        return JsonResponse::data($this->boards->save($user, $id, static fn (): array => JsonRequest::body(65536, 413)));
    }

    public function delete(AuthenticatedUser $user, string $id): JsonResponse
    {
        $this->boards->delete($user, $id, static fn (): array => JsonRequest::body(4096, 413));
        return JsonResponse::noContent();
    }
}
