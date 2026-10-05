<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Auth\AuthService;
use MyFunList\Auth\PasswordHasher;
use MyFunList\Auth\ProfileService;
use MyFunList\Http\Controllers\AuthController;
use MyFunList\Http\Controllers\DiscoverController;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Controllers\LibraryController;
use MyFunList\Http\Controllers\ListController;
use MyFunList\Http\Controllers\ProfileController;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Middleware\AuthMiddleware;
use MyFunList\Http\Middleware\RateLimitMiddleware;
use MyFunList\Http\Router;
use MyFunList\Library\LibraryService;
use MyFunList\Library\LibraryImportService;
use MyFunList\Lists\ListService;
use MyFunList\Provider\CurlProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\PhpSession;
use MyFunList\Infrastructure\SessionCurrentUserProvider;
use MyFunList\Infrastructure\UserRepository;
use MyFunList\RateLimit\RateLimiter;

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
$limits = new RateLimitMiddleware(new RateLimiter($database, require __DIR__ . '/rate_limits.php'));
$providers = new ProviderMediaResolver(new CurlProviderHttpClient());
$libraryService = new LibraryService($database, $providers);
$library = new LibraryController($libraryService, new LibraryImportService($libraryService));
$lists = new ListController(new ListService($database));
$discover = new DiscoverController($providers);

$router->add('GET', '/api/v1/health', new HealthController($database));
foreach (['movie', 'tv', 'game'] as $mediaType) {
    $router->add('GET', '/api/v1/discover/' . $mediaType,
        $limits->ip('discover_ip', static fn (): JsonResponse => $discover->search($mediaType, $_GET)));
}
$router->add('GET', '/api/v1/auth/csrf', [$auth, 'csrf']);
$router->add('POST', '/api/v1/auth/register', $middleware->csrf(
    $limits->ip('register_ip', [$auth, 'register']),
));
$router->add('POST', '/api/v1/auth/login', $middleware->csrf($limits->login([$auth, 'login'])));
$router->add('POST', '/api/v1/auth/logout', $middleware->requireUser(
    $middleware->csrf([$auth, 'logout']),
));
$router->add('GET', '/api/v1/auth/me', $middleware->requireUser([$auth, 'me']));
$router->add('GET', '/api/v1/profile', $middleware->requireUser([$profile, 'show']));
$router->add('PATCH', '/api/v1/profile', $middleware->requireUser(
    $middleware->csrf([$profile, 'update']),
));
$router->add('POST', '/api/v1/account/password', $middleware->requireUser(
    $middleware->csrf($limits->user('password_user', [$profile, 'changePassword'])),
));
$router->add('GET', '/api/v1/library', $middleware->requireUser([$library, 'list']));
$router->add('POST', '/api/v1/library', $middleware->requireUser(
    $middleware->csrf([$library, 'add']),
));
$router->add('POST', '/api/v1/library/import', $middleware->requireUser(
    $middleware->csrf($limits->user('import_user', [$library, 'import'])),
));
$router->add('PATCH', '/api/v1/library/{entryId}', $middleware->requireUser(
    $middleware->csrf([$library, 'update']),
));
$router->add('DELETE', '/api/v1/library/{entryId}', $middleware->requireUser(
    $middleware->csrf([$library, 'delete']),
));
$router->add('GET', '/api/v1/lists', $middleware->requireUser([$lists, 'all']));
$router->add('POST', '/api/v1/lists', $middleware->requireUser(
    $middleware->csrf([$lists, 'create']),
));
$router->add('GET', '/api/v1/lists/{listId}', $middleware->requireUser([$lists, 'show']));
$router->add('PATCH', '/api/v1/lists/{listId}', $middleware->requireUser(
    $middleware->csrf([$lists, 'update']),
));
$router->add('DELETE', '/api/v1/lists/{listId}', $middleware->requireUser(
    $middleware->csrf([$lists, 'delete']),
));
$router->add('POST', '/api/v1/lists/{listId}/items', $middleware->requireUser(
    $middleware->csrf([$lists, 'addItem']),
));
$router->add('DELETE', '/api/v1/lists/{listId}/items/{entryId}', $middleware->requireUser(
    $middleware->csrf([$lists, 'removeItem']),
));

return new Application($router);
