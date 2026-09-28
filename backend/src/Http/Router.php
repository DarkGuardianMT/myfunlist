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
            $parameters = $this->matchParameters($route, $path);
            if ($parameters !== null) {
                return $handler(...$parameters);
            }
        }

        $allowed = [];
        foreach ($this->routes as $routeMethod => $paths) {
            if (isset($paths[$path])) {
                $allowed[] = $routeMethod;
                continue;
            }
            foreach ($paths as $route => $_handler) {
                if ($this->matchParameters($route, $path) !== null) {
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

    private function matchParameters(string $route, string $path): ?array
    {
        $routeParts = explode('/', trim($route, '/'));
        $pathParts = explode('/', trim($path, '/'));
        if (count($routeParts) !== count($pathParts)) {
            return null;
        }

        $parameters = [];
        foreach ($routeParts as $index => $part) {
            if (preg_match('/^\{[A-Za-z][A-Za-z0-9]*\}$/D', $part) === 1) {
                if (preg_match('/^[1-9][0-9]{0,19}$/D', $pathParts[$index]) !== 1) {
                    return null;
                }
                $parameters[] = $pathParts[$index];
            } elseif ($part !== $pathParts[$index]) {
                return null;
            }
        }

        return $parameters === [] ? null : $parameters;
    }
}
