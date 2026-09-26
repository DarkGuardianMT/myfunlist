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

        $allowed = [];
        foreach ($this->routes as $routeMethod => $paths) {
            if (isset($paths[$path])) {
                $allowed[] = $routeMethod;
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
}
