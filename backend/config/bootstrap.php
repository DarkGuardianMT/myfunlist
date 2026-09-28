<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Auth\AuthService;
use MyFunList\Auth\PasswordHasher;
use MyFunList\Auth\ProfileService;
use MyFunList\Http\Controllers\AuthController;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Controllers\LibraryController;
use MyFunList\Http\Controllers\ProfileController;
use MyFunList\Http\Middleware\AuthMiddleware;
use MyFunList\Http\Router;
use MyFunList\Library\LibraryService;
use MyFunList\Library\LibraryImportService;
use MyFunList\Provider\CurlProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\PhpSession;
use MyFunList\Infrastructure\SessionCurrentUserProvider;
use MyFunList\Infrastructure\UserRepository;

require __DIR__ . '/environment.php';

$router = new Router();
$database = new Database();
$session = new PhpSession();
$users = new UserRepository($database);
$passwords = new PasswordHasher();
$auth = new AuthController(
    new AuthService($users, $passwords),
    $session,
);
$profile = new ProfileController(new ProfileService($users, $passwords), $session);
$middleware = new AuthMiddleware($session, new SessionCurrentUserProvider($session));
$libraryService = new LibraryService(
    $database,
    new ProviderMediaResolver(new CurlProviderHttpClient()),
);
$library = new LibraryController($libraryService, new LibraryImportService($libraryService));

$router->add('GET', '/api/v1/health', new HealthController($database));
$router->add('GET', '/api/v1/auth/csrf', [$auth, 'csrf']);
$router->add('POST', '/api/v1/auth/register', $middleware->csrf([$auth, 'register']));
$router->add('POST', '/api/v1/auth/login', $middleware->csrf([$auth, 'login']));
$router->add('POST', '/api/v1/auth/logout', $middleware->requireUser(
    $middleware->csrf([$auth, 'logout']),
));
$router->add('GET', '/api/v1/auth/me', $middleware->requireUser([$auth, 'me']));
$router->add('GET', '/api/v1/profile', $middleware->requireUser([$profile, 'show']));
$router->add('PATCH', '/api/v1/profile', $middleware->requireUser(
    $middleware->csrf([$profile, 'update']),
));
$router->add('POST', '/api/v1/account/password', $middleware->requireUser(
    $middleware->csrf([$profile, 'changePassword']),
));
$router->add('GET', '/api/v1/library', $middleware->requireUser([$library, 'list']));
$router->add('POST', '/api/v1/library', $middleware->requireUser(
    $middleware->csrf([$library, 'add']),
));
$router->add('POST', '/api/v1/library/import', $middleware->requireUser(
    $middleware->csrf([$library, 'import']),
));
$router->add('PATCH', '/api/v1/library/{entryId}', $middleware->requireUser(
    $middleware->csrf([$library, 'update']),
));
$router->add('DELETE', '/api/v1/library/{entryId}', $middleware->requireUser(
    $middleware->csrf([$library, 'delete']),
));

return new Application($router);
