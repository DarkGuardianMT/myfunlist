<?php

declare(strict_types=1);

use MyFunList\Http\Application;
use MyFunList\Auth\AuthService;
use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Auth\PasswordHasher;
use MyFunList\Auth\ProfileService;
use MyFunList\Domain\MediaRules;
use MyFunList\Http\Controllers\AuthController;
use MyFunList\Http\Controllers\DiscoverController;
use MyFunList\Http\Controllers\HealthController;
use MyFunList\Http\Controllers\LibraryController;
use MyFunList\Http\Controllers\ListController;
use MyFunList\Http\Controllers\MediaController;
use MyFunList\Http\Controllers\OpenLibraryController;
use MyFunList\Http\Controllers\ProfileController;
use MyFunList\Http\Controllers\TierListController;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Middleware\AuthMiddleware;
use MyFunList\Http\Middleware\RateLimitMiddleware;
use MyFunList\Http\Router;
use MyFunList\Library\LibraryService;
use MyFunList\Library\LibraryImportService;
use MyFunList\Lists\ListService;
use MyFunList\Provider\CurlProviderHttpClient;
use MyFunList\Provider\ProviderMediaResolver;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\OpenLibraryAccess;
use MyFunList\Provider\OpenLibraryMediaResolver;
use MyFunList\Infrastructure\MediaRepository;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\PhpSession;
use MyFunList\Infrastructure\SessionCurrentUserProvider;
use MyFunList\Infrastructure\UserRepository;
use MyFunList\RateLimit\RateLimiter;
use MyFunList\TierLists\TierListDraft;
use MyFunList\TierLists\TierListMediaPreparation;
use MyFunList\TierLists\TierListService;

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
$pilot = OpenLibraryPilot::fromEnvironment(new CurlProviderHttpClient());
$providers = new ProviderMediaResolver(new CurlProviderHttpClient(), new OpenLibraryMediaResolver($pilot,
    static fn (string $id): ?array => (new MediaRepository($database->connect()))->findByIdentity('open-library', 'book', $id)));
$libraryService = new LibraryService($database, $providers);
$library = new LibraryController($libraryService, new LibraryImportService($libraryService));
$lists = new ListController(new ListService($database));
$discover = new DiscoverController($providers);
$media = new MediaController($providers);
$openLibrary = new OpenLibraryController($pilot);
$openLibraryAccess = OpenLibraryAccess::fromEnvironment();
$testerSearch = $middleware->requireUser(static function (AuthenticatedUser $identity) use ($openLibrary, $openLibraryAccess): JsonResponse {
    if (!$openLibraryAccess->isTester($identity->id)) {
        return JsonResponse::error(403, 'forbidden', 'Open Library pilot access is restricted.', ['Cache-Control' => 'no-store']);
    }
    return $openLibrary->search($_GET);
});

$router->add('GET', '/api/v1/health', new HealthController($database));
$router->add('GET', '/api/v1/pilot/open-library/search',
    // De uitgeschakelde pilot stopt in de controller; publieke reads starten geen sessie.
    static fn (): JsonResponse => !$openLibraryAccess->enabled || $openLibraryAccess->public ? $openLibrary->search($_GET) : $testerSearch());
foreach (['movie', 'tv', 'game'] as $mediaType) {
    $router->add('GET', '/api/v1/discover/' . $mediaType,
        $limits->ip('discover_ip', static fn (): JsonResponse => $discover->search($mediaType, $_GET)));
}
foreach (['book' => 'google-books', 'movie' => 'tmdb', 'tv' => 'tmdb', 'game' => 'rawg'] as $mediaType => $source) {
    $router->add('GET', '/api/v1/media/' . $mediaType . '/' . $source . '/{sourceId}',
        $limits->ip('media_detail_ip', static fn (string $sourceId): JsonResponse => $media->show($mediaType, $source, $sourceId)),
        ['sourceId' => static fn (string $sourceId): bool => MediaRules::isValidSourceId($source, $sourceId)]);
}
$router->add('GET', '/api/v1/media/book/open-library/{sourceId}',
    $limits->ip('media_detail_ip', static fn (string $sourceId): JsonResponse => $media->show('book', 'open-library', $sourceId)),
    ['sourceId' => static fn (string $sourceId): bool => MediaRules::isValidSourceId('open-library', $sourceId)]);
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
$router->add('GET', '/api/v1/lists/memberships', $middleware->requireUser([$lists, 'memberships']));
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

$tierListsPath = '/api/v1/tier-lists';
$tierListsEnabled = ($_ENV['TIER_LISTS_ENABLED'] ?? $_SERVER['TIER_LISTS_ENABLED'] ?? getenv('TIER_LISTS_ENABLED')) === 'true';
if ($tierListsEnabled) {
    $tierLists = new TierListController(new TierListService($database), new TierListMediaPreparation($database, $providers, $openLibraryAccess));
    $details = $tierListsPath . '/{id}';
    $id = ['id' => TierListDraft::validId(...)];
    $router->add('GET', $tierListsPath, $middleware->requireUser([$tierLists, 'all']));
    $router->add('POST', $tierListsPath, $middleware->requireUser($middleware->csrf([$tierLists, 'create'])));
    $router->add('GET', $details, $middleware->requireUser([$tierLists, 'show']), $id);
    $router->add('PUT', $details, $middleware->requireUser($middleware->csrf([$tierLists, 'save'])), $id);
    $router->add('DELETE', $details, $middleware->requireUser($middleware->csrf([$tierLists, 'delete'])), $id);
    $router->add('POST', $details . '/media/prepare', $middleware->requireUser(
        $middleware->csrf($limits->user('tier_list_prepare_user', [$tierLists, 'prepare'])),
    ), $id);
}

return new Application($router, [$tierListsPath]);
