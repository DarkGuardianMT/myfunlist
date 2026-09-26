<?php

declare(strict_types=1);

namespace MyFunList;

use MyFunList\Infrastructure\DatabaseUnavailable;

final class Config
{
    public static function database(): array
    {
        $values = [];

        foreach (['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'] as $key) {
            $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);

            if ($value === false || !is_string($value) || ($value === '' && $key !== 'DB_PASSWORD')) {
                throw new DatabaseUnavailable();
            }

            $values[$key] = $value;
        }

        $port = filter_var($values['DB_PORT'], FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);

        if ($port === false) {
            throw new DatabaseUnavailable();
        }

        return [
            'host' => $values['DB_HOST'],
            'port' => $port,
            'database' => $values['DB_DATABASE'],
            'username' => $values['DB_USERNAME'],
            'password' => $values['DB_PASSWORD'],
        ];
    }
}
