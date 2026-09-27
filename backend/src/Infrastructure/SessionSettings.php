<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

final class SessionSettings
{
    public function __construct(
        public readonly string $cookieName,
        public readonly bool $secure,
    ) {
    }

    public static function forRequest(string $environment, string $host, bool $https): self
    {
        $localHttp = in_array($environment, ['development', 'testing'], true)
            && in_array(strtolower($host), ['localhost', '127.0.0.1', '[::1]'], true)
            && !$https;

        return new self(
            $localHttp ? 'myfunlist_session' : '__Host-myfunlist_session',
            !$localHttp,
        );
    }
}
