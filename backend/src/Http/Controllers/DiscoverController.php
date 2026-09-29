<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Http\ApiException;
use MyFunList\Http\JsonResponse;
use MyFunList\Provider\MediaSearcher;
use MyFunList\Provider\ProviderException;

final class DiscoverController
{
    public function __construct(private readonly MediaSearcher $searcher)
    {
    }

    public function search(string $mediaType, array $parameters): JsonResponse
    {
        if (!in_array($mediaType, ['movie', 'tv', 'game'], true)) {
            throw new ApiException(404, 'not_found', 'Route not found.');
        }
        if (count($parameters) !== 1 || !is_string($parameters['q'] ?? null)) {
            throw self::invalidQuery();
        }

        $query = preg_replace('/^\s+|\s+$/u', '', $parameters['q']);
        if (!is_string($query) || preg_match('/^.{1,200}$/usD', $query) !== 1
            || preg_match('/[\x00-\x1F\x7F]/u', $query) === 1) {
            throw self::invalidQuery();
        }

        try {
            $results = $this->searcher->search($mediaType, $query);
        } catch (ProviderException $exception) {
            if ($exception->status === 503) {
                throw new ApiException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            throw new ApiException(502, 'provider_error', 'Media provider could not complete the search.');
        }

        return JsonResponse::data($results, headers: ['Cache-Control' => 'no-store']);
    }

    private static function invalidQuery(): ApiException
    {
        return new ApiException(422, 'validation_error', 'Check the supplied fields.', [
            'q' => 'Enter a search query of 1 to 200 characters.',
        ]);
    }
}
