<?php

declare(strict_types=1);

namespace MyFunList\Auth;

final class AuthenticatedUser
{
    public function __construct(public readonly string $id)
    {
    }
}
