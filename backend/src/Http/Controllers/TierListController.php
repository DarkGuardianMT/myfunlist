<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Http\JsonRequest;
use MyFunList\Http\JsonResponse;
use MyFunList\Provider\ProviderException;
use MyFunList\RateLimit\OpenLibraryClientLimitExceeded;
use MyFunList\TierLists\TierListMediaPreparation;
use MyFunList\TierLists\TierListService;

final class TierListController
{
    public function __construct(
        private readonly TierListService $boards,
        private readonly TierListMediaPreparation $media,
    ) {
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

    public function prepare(AuthenticatedUser $user, string $id): JsonResponse
    {
        try {
            return JsonResponse::data($this->media->prepare($user, $id, static fn (): array => JsonRequest::body(1024, 413)));
        } catch (OpenLibraryClientLimitExceeded $exception) {
            return JsonResponse::error(429, 'rate_limited', 'Too many requests. Please try again later.',
                ['Retry-After' => (string) $exception->retryAfter]);
        } catch (ProviderException $exception) {
            // Alleen vaste foutteksten; upstream kan sleutels of URL's in de melding opnemen.
            if ($exception->errorCode === 'provider_busy' && $exception->status === 503) {
                return JsonResponse::error(503, 'provider_busy', 'Book search is busy. Please wait before retrying.', ['Retry-After' => '2']);
            }
            if (in_array($exception->status, [401, 403, 429], true) || ($exception->status >= 500 && $exception->status !== 502)) {
                return JsonResponse::error(503, 'provider_unavailable', 'Media provider is unavailable.', ['Retry-After' => '60']);
            }
            return $exception->status === 404
                ? JsonResponse::error(404, 'media_not_found', 'Media was not found.')
                : JsonResponse::error(502, 'provider_error', 'Media provider returned invalid data.');
        }
    }
}
