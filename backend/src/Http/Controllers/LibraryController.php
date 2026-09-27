<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\Library\LibraryService;

final class LibraryController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(private readonly LibraryService $library)
    {
    }

    public function list(AuthenticatedUser $user): JsonResponse
    {
        return JsonResponse::data($this->library->list($user), headers: self::NO_STORE);
    }

    public function add(AuthenticatedUser $user): JsonResponse
    {
        $result = $this->library->add($user, JsonRequest::body());

        return JsonResponse::data($result, $result['added'] ? 201 : 200, self::NO_STORE);
    }

    public function update(AuthenticatedUser $user, string $entryId): JsonResponse
    {
        return JsonResponse::data(
            $this->library->update($user, $entryId, JsonRequest::body()),
            headers: self::NO_STORE,
        );
    }

    public function delete(AuthenticatedUser $user, string $entryId): JsonResponse
    {
        $this->library->delete($user, $entryId);

        return JsonResponse::noContent();
    }
}
