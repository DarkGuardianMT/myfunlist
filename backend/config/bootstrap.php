<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Router;
use MyFunList\Infrastructure\Database;

require __DIR__ . '/environment.php';

$router = new Router();
$router->add('GET', '/api/v1/health', new HealthController(new Database()));

return new Application($router);
