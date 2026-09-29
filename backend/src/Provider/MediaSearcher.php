<?php

declare(strict_types=1);

namespace MyFunList\Provider;

interface MediaSearcher
{
    public function search(string $mediaType, string $query): array;
}
