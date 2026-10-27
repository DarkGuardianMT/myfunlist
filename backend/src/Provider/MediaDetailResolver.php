<?php

declare(strict_types=1);

namespace MyFunList\Provider;

interface MediaDetailResolver
{
    public function resolveDetail(string $source, string $mediaType, string $sourceId): array;
}
