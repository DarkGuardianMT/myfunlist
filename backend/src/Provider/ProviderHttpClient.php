<?php

declare(strict_types=1);

namespace MyFunList\Provider;

interface ProviderHttpClient
{
    public function get(string $url, array $headers = []): array;
}
