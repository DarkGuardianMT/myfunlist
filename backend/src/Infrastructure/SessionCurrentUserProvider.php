<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use MyFunList\Auth\AuthenticatedUser;
use MyFunList\Auth\CurrentUserProvider;

final class SessionCurrentUserProvider implements CurrentUserProvider
{
    public function __construct(private readonly PhpSession $session)
    {
    }

    public function currentUser(): ?AuthenticatedUser
    {
        $id = $this->session->userId();

        return $id === null ? null : new AuthenticatedUser($id);
    }
}
