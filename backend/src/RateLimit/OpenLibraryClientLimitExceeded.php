<?php

declare(strict_types=1);

namespace MyFunList\RateLimit;

use RuntimeException;

final class OpenLibraryClientLimitExceeded extends RuntimeException
{
    public function __construct(public readonly int $retryAfter)
    {
        parent::__construct('Too many requests. Please try again later.');
    }
}
