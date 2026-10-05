<?php

declare(strict_types=1);

return [
    'login_ip' => ['limit' => 20, 'window' => 900],
    'login_account' => ['limit' => 10, 'window' => 900],
    'register_ip' => ['limit' => 10, 'window' => 3600],
    'discover_ip' => ['limit' => 60, 'window' => 60],
    'import_user' => ['limit' => 120, 'window' => 3600],
    'password_user' => ['limit' => 10, 'window' => 900],
];
