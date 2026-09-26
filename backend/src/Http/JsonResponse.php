<?php

declare(strict_types=1);

namespace MyFunList\Http;

final class JsonResponse
{
    private function __construct(
        public readonly int $status,
        private readonly array $payload,
        private readonly array $headers = [],
    ) {
    }

    public static function data(mixed $data, int $status = 200): self
    {
        return new self($status, ['data' => $data]);
    }

    public static function error(int $status, string $code, string $message, array $headers = []): self
    {
        return new self($status, ['error' => ['code' => $code, 'message' => $message]], $headers);
    }

    public function body(): string
    {
        return json_encode($this->payload, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES);
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');

        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }

        echo $this->body();
    }
}
