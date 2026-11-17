<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use Closure;
use MyFunList\Domain\MediaRules;
use MyFunList\Http\ApiException;

final class OpenLibraryMediaResolver implements MediaResolver, MediaDetailResolver
{
    public function __construct(private readonly OpenLibraryPilot $pilot, private readonly Closure $findMedia)
    {
    }

    public function resolve(string $source, string $mediaType, string $sourceId): array
    {
        self::validate($source, $mediaType, $sourceId);
        return $this->pilot->resolveEdition($sourceId);
    }

    public function resolveDetail(string $source, string $mediaType, string $sourceId): array
    {
        self::validate($source, $mediaType, $sourceId);
        $media = ($this->findMedia)($sourceId);
        if ($media === null) throw new ProviderException(404, 'media_not_found', 'Media was not found.');
        // Een opgeslagen editie blijft leesbaar zonder nieuwe zoek- of providerrequests.
        try {
            return OpenLibraryEdition::detail($media);
        } catch (ApiException) {
            throw new ProviderException(502, 'provider_error', 'Stored edition metadata is unavailable.');
        }
    }

    private static function validate(string $source, string $type, string $id): void
    {
        if ($source !== 'open-library' || $type !== 'book' || !MediaRules::isValidSourceId($source, $id)) {
            throw new ProviderException(404, 'media_not_found', 'Media was not found.');
        }
    }
}
