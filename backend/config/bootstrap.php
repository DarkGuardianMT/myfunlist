<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Dotenv\Repository\Adapter\PutenvAdapter;
use Dotenv\Repository\RepositoryBuilder;
use MyFunList\Http\Application;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Router;
use MyFunList\Infrastructure\Database;

require dirname(__DIR__) . '/vendor/autoload.php';

$environment = RepositoryBuilder::createWithDefaultAdapters()
    ->addReader(PutenvAdapter::class)
    ->immutable()
    ->make();
Dotenv::create($environment, dirname(__DIR__))->safeLoad();

$router = new Router();
$router->add('GET', '/api/v1/health', new HealthController(new Database()));

return new Application($router);
