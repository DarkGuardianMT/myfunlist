<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\Lists\ListService;

final class ListController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(private readonly ListService $lists)
    {
    }

    public function all(AuthenticatedUser $user): JsonResponse
    {
        return JsonResponse::data($this->lists->all($user), headers: self::NO_STORE);
    }

    public function create(AuthenticatedUser $user): JsonResponse
    {
        return JsonResponse::data($this->lists->create($user, JsonRequest::body()), 201, self::NO_STORE);
    }

    public function show(AuthenticatedUser $user, string $listId): JsonResponse
    {
        return JsonResponse::data($this->lists->get($user, $listId), headers: self::NO_STORE);
    }

    public function update(AuthenticatedUser $user, string $listId): JsonResponse
    {
        return JsonResponse::data($this->lists->update($user, $listId, JsonRequest::body()), headers: self::NO_STORE);
    }

    public function delete(AuthenticatedUser $user, string $listId): JsonResponse
    {
        $this->lists->delete($user, $listId);

        return JsonResponse::noContent();
    }

    public function addItem(AuthenticatedUser $user, string $listId): JsonResponse
    {
        $added = $this->lists->addItem($user, $listId, JsonRequest::body());

        return JsonResponse::data(['added' => $added], $added ? 201 : 200, self::NO_STORE);
    }

    public function removeItem(AuthenticatedUser $user, string $listId, string $entryId): JsonResponse
    {
        $this->lists->removeItem($user, $listId, $entryId);

        return JsonResponse::noContent();
    }
}
