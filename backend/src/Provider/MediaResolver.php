<?php

declare(strict_types=1);

namespace MyFunList\Provider;

interface MediaResolver
{
    public function resolve(string $source, string $mediaType, string $sourceId): array;
}
