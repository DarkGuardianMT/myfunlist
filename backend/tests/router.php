<?php

declare(strict_types=1);

use MyFunList\Domain\MediaRules;
use MyFunList\Http\Application;
use MyFunList\Http\JsonResponse;
use MyFunList\Http\Router;

require dirname(__DIR__) . '/vendor/autoload.php';

$checks = 0;
function verifyRouter(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}

$router = new Router();
$numericRoutes = [
    ['PATCH', '/api/v1/library/{entryId}'], ['DELETE', '/api/v1/library/{entryId}'],
    ['GET', '/api/v1/lists/{listId}'], ['PATCH', '/api/v1/lists/{listId}'],
    ['DELETE', '/api/v1/lists/{listId}'], ['POST', '/api/v1/lists/{listId}/items'],
    ['DELETE', '/api/v1/lists/{listId}/items/{entryId}'],
];
foreach ($numericRoutes as [$method, $path]) {
    $router->add($method, $path, static fn (string ...$ids): JsonResponse => JsonResponse::data($ids));
}
$calls = 0;
$router->add('GET', '/media/{sourceId}', static function (string $id) use (&$calls): JsonResponse {
    $calls++;
    return JsonResponse::data($id);
}, ['sourceId' => static fn (string $id): bool => MediaRules::isValidSourceId('google-books', $id)]);
$router->add('GET', '/media/new', static fn (): JsonResponse => JsonResponse::data('static'));
$router->add('GET', '/health', static fn (): JsonResponse => JsonResponse::data(['ok' => true]));
$router->add('POST', '/health', static fn (): JsonResponse => JsonResponse::noContent());
$router->add('GET', '/failure', static function (): JsonResponse {
    throw new RuntimeException('internal fixture-secret');
});
$app = new Application($router);

foreach ($numericRoutes as [$method, $template]) {
    foreach (['1', '12345678901234567890'] as $id) {
        $path = str_replace(['{listId}', '{entryId}'], $id, $template);
        $response = $app->handle($method, $path);
        $expectedIds = array_fill(0, substr_count($template, '{'), $id);
        verifyRouter($response->status === 200 && json_decode($response->body(), true)['data'] === $expectedIds,
            'Numeric route values and handler argument order must remain unchanged.');
    }
    foreach (['{listId}', '{entryId}'] as $parameter) {
        if (!str_contains($template, $parameter)) continue;
        foreach (['0', '-1', '01', 'abc', 'Ab_9-x', '1.5', '%31', '%2F', '..', str_repeat('1', 21)] as $invalid) {
            $path = str_replace($parameter, $invalid, $template);
            $path = str_replace(['{listId}', '{entryId}'], '42', $path);
            verifyRouter($app->handle($method, $path)->status === 404 && $app->handle('PUT', $path)->status === 404,
                'Unconstrained routes must retain numeric validation for dispatch and 405 checks.');
        }
    }
}
verifyRouter($app->handle('GET', '/media/Ab_9-x')->body() === '{"data":"Ab_9-x"}' && $calls === 1,
    'A named constraint must permit Google Books IDs only on its own route.');
verifyRouter($app->handle('GET', '/media/new')->body() === '{"data":"static"}' && $calls === 1,
    'Exact static routes must retain priority over parameterized routes.');
$wrongMethod = $app->handle('POST', '/media/Ab_9-x');
$headers = new ReflectionProperty(JsonResponse::class, 'headers');
verifyRouter($wrongMethod->status === 405 && $headers->getValue($wrongMethod)['Allow'] === 'GET' && $calls === 1,
    '405 responses must use matching constraints and advertise the allowed method.');
foreach (['/media/{sourceId}', '/media/a.b', '/media/a%2Fb', '/media/a/b', '/missing'] as $path) {
    verifyRouter($app->handle('GET', $path)->status === 404 && $app->handle('POST', $path)->status === 404,
        'Invalid parameter paths must be 404 for every method, including literal route placeholders.');
}
verifyRouter($app->handle('GET', '/health')->body() === '{"data":{"ok":true}}'
    && $app->handle('POST', '/health')->status === 204 && $app->handle('GET', '/health/')->status === 404,
    'Static routing and trailing-slash behavior must remain unchanged.');
$wrongMethod = $app->handle('DELETE', '/health');
verifyRouter($wrongMethod->status === 405 && $headers->getValue($wrongMethod)['Allow'] === 'GET, POST',
    'Static routes must retain all supported methods in the Allow header.');
$failure = $app->handle('GET', '/failure');
verifyRouter($failure->status === 500 && !str_contains($failure->body(), 'fixture-secret')
    && json_decode($failure->body(), true)['error']['code'] === 'internal_error',
    'Foundation error handling must keep unexpected internal errors private.');
echo 'Router/foundation checks passed (', $checks, " assertions; no database connections).\n";
