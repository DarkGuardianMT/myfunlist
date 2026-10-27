<?php

declare(strict_types=1);

namespace MyFunList\Http;

final class Router
{
    private array $routes = [];

    public function add(string $method, string $path, callable $handler, array $constraints = []): void
    {
        $this->routes[$method][$path] = ['handler' => $handler, 'constraints' => $constraints];
    }

    public function dispatch(string $method, string $path): JsonResponse
    {
        if (isset($this->routes[$method][$path]) && !str_contains($path, '{')) {
            return ($this->routes[$method][$path]['handler'])();
        }

        foreach ($this->routes[$method] ?? [] as $route => $definition) {
            $parameters = $this->matchParameters($route, $path, $definition['constraints']);
            if ($parameters !== null) {
                return ($definition['handler'])(...$parameters);
            }
        }

        $allowed = [];
        foreach ($this->routes as $routeMethod => $paths) {
            foreach ($paths as $route => $definition) {
                if ($this->matchParameters($route, $path, $definition['constraints']) !== null) {
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

    private function matchParameters(string $route, string $path, array $constraints): ?array
    {
        if (!str_contains($route, '{')) {
            return $route === $path ? [] : null;
        }
        $routeParts = explode('/', trim($route, '/'));
        $pathParts = explode('/', trim($path, '/'));
        if (count($routeParts) !== count($pathParts)) {
            return null;
        }

        $parameters = [];
        foreach ($routeParts as $index => $part) {
            if (preg_match('/^\{([A-Za-z][A-Za-z0-9]*)\}$/D', $part, $match) === 1) {
                // Alleen deze route mag de bestaande numerieke standaard overschrijven.
                $valid = isset($constraints[$match[1]])
                    ? $constraints[$match[1]]($pathParts[$index])
                    : preg_match('/^[1-9][0-9]{0,19}$/D', $pathParts[$index]) === 1;
                if (!$valid) {
                    return null;
                }
                $parameters[] = $pathParts[$index];
            } elseif ($part !== $pathParts[$index]) {
                return null;
            }
        }

        return $parameters;
    }
}
