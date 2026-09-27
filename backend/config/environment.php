<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Dotenv\Repository\Adapter\PutenvAdapter;
use Dotenv\Repository\RepositoryBuilder;

require dirname(__DIR__) . '/vendor/autoload.php';

$environment = RepositoryBuilder::createWithDefaultAdapters()
    ->addReader(PutenvAdapter::class)
    ->immutable()
    ->make();
Dotenv::create($environment, dirname(__DIR__))->safeLoad();
