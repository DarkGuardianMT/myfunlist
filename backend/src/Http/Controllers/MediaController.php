<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;
use MyFunList\Http\JsonResponse;
use MyFunList\Provider\MediaDetailResolver;
use MyFunList\Provider\ProviderException;

final class MediaController
{
    public function __construct(private readonly MediaDetailResolver $resolver)
    {
    }

    public function show(string $mediaType, string $source, string $sourceId): JsonResponse
    {
        if (!MediaRules::supports($source, $mediaType) || !MediaRules::isValidSourceId($source, $sourceId)) {
            throw new ApiException(404, 'not_found', 'Route not found.');
        }

        try {
            $detail = $this->resolver->resolveDetail($source, $mediaType, $sourceId);
        } catch (ProviderException $exception) {
            // Log alleen vaste brongegevens en de foutcategorie, nooit providerteksten of URL's.
            error_log('Provider detail failed: ' . $source . ' ' . $mediaType . ' HTTP ' . $exception->status);
            throw match ($exception->status) {
                404 => new ApiException(404, 'media_not_found', 'Media was not found.'),
                503 => new ApiException(503, 'provider_unavailable', 'Media provider is unavailable.'),
                default => new ApiException(502, 'provider_error', 'Media provider returned invalid data.'),
            };
        }

        return JsonResponse::data($detail, headers: ['Cache-Control' => 'no-store']);
    }
}
