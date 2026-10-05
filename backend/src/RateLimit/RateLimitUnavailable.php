<?php

declare(strict_types=1);

namespace MyFunList\RateLimit;

use RuntimeException;

final class RateLimitUnavailable extends RuntimeException
{
}
