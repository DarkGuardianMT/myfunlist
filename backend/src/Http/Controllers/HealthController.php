<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Http\JsonResponse;
use MyFunList\Infrastructure\Database;

final class HealthController
{
    public function __construct(private readonly Database $database)
    {
    }

    public function __invoke(): JsonResponse
    {
        $this->database->check();

        return JsonResponse::data(['status' => 'ok']);
    }
}
