<?php

declare(strict_types=1);

ini_set('display_errors', '0');

try {
    $application = require dirname(__DIR__) . '/config/bootstrap.php';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $application->handle($method, is_string($path) ? $path : '/')->send();
} catch (Throwable $exception) {
    error_log('API bootstrap failed: ' . get_class($exception));
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":{"code":"internal_error","message":"Something went wrong."}}';
}
