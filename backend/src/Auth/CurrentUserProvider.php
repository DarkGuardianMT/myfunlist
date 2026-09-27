<?php

declare(strict_types=1);

namespace MyFunList\Auth;

interface CurrentUserProvider
{
    public function currentUser(): ?AuthenticatedUser;
}
