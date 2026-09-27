<?php

declare(strict_types=1);

namespace MyFunList\Http;

final class Router
{
    private array $routes = [];

    public function add(string $method, string $path, callable $handler): void
    {
        $this->routes[$method][$path] = $handler;
    }

    public function dispatch(string $method, string $path): JsonResponse
    {
        if (isset($this->routes[$method][$path])) {
            return ($this->routes[$method][$path])();
        }

        foreach ($this->routes[$method] ?? [] as $route => $handler) {
            $parameter = $this->matchEntryId($route, $path);
            if ($parameter !== null) {
                return $handler($parameter);
            }
        }

        $allowed = [];
        foreach ($this->routes as $routeMethod => $paths) {
            if (isset($paths[$path])) {
                $allowed[] = $routeMethod;
                continue;
            }
            foreach ($paths as $route => $_handler) {
                if ($this->matchEntryId($route, $path) !== null) {
                    $allowed[] = $routeMethod;
                    break;
                }
            }
        }

        if ($allowed !== []) {
            return JsonResponse::error(
                405,
                'method_not_allowed',
                'Method not allowed.',
                ['Allow' => implode(', ', $allowed)],
            );
        }

        return JsonResponse::error(404, 'not_found', 'Route not found.');
    }

    private function matchEntryId(string $route, string $path): ?string
    {
        if (!str_ends_with($route, '/{entryId}')) {
            return null;
        }

        $prefix = substr($route, 0, -strlen('{entryId}'));
        if (!str_starts_with($path, $prefix)) {
            return null;
        }

        $id = substr($path, strlen($prefix));

        return preg_match('/^[1-9][0-9]{0,19}$/D', $id) === 1 ? $id : null;
    }
}
