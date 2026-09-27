<?php

declare(strict_types=1);

namespace MyFunList\Http;

use MyFunList\Infrastructure\DatabaseUnavailable;
use Throwable;

final class Application
{
    public function __construct(private readonly Router $router)
    {
    }

    public function handle(string $method, string $path): JsonResponse
    {
        try {
            return $this->router->dispatch($method, $path);
        } catch (ApiException $exception) {
            return JsonResponse::error(
                $exception->status,
                $exception->errorCode,
                $exception->getMessage(),
                fields: $exception->fields,
            );
        } catch (DatabaseUnavailable) {
            error_log('API database check failed');
            return JsonResponse::error(503, 'service_unavailable', 'Service unavailable.');
        } catch (Throwable $exception) {
            error_log('Unhandled API error: ' . get_class($exception));
            return JsonResponse::error(500, 'internal_error', 'Something went wrong.');
        }
    }
}
