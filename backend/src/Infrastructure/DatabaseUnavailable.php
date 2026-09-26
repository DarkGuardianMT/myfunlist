<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use RuntimeException;

final class DatabaseUnavailable extends RuntimeException
{
}
