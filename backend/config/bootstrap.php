<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Auth\AuthService;
use MyFunList\Auth\PasswordHasher;
use MyFunList\Http\Controllers\AuthController;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Middleware\AuthMiddleware;
use MyFunList\Http\Router;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\PhpSession;
use MyFunList\Infrastructure\SessionCurrentUserProvider;
use MyFunList\Infrastructure\UserRepository;

require __DIR__ . '/environment.php';

$router = new Router();
$database = new Database();
$session = new PhpSession();
$auth = new AuthController(
    new AuthService(new UserRepository($database), new PasswordHasher()),
    $session,
);
$middleware = new AuthMiddleware($session, new SessionCurrentUserProvider($session));

$router->add('GET', '/api/v1/health', new HealthController($database));
$router->add('GET', '/api/v1/auth/csrf', [$auth, 'csrf']);
$router->add('POST', '/api/v1/auth/register', $middleware->csrf([$auth, 'register']));
$router->add('POST', '/api/v1/auth/login', $middleware->csrf([$auth, 'login']));
$router->add('POST', '/api/v1/auth/logout', $middleware->requireUser(
    $middleware->csrf([$auth, 'logout']),
));
$router->add('GET', '/api/v1/auth/me', $middleware->requireUser([$auth, 'me']));

return new Application($router);
