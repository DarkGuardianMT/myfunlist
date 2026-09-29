<?php

declare(strict_types=1);

require __DIR__ . '/support/database.php';

$safe = ['database' => 'myfunlist_test', 'host' => '127.0.0.1'];
assertSafeTestDatabase($safe, 'testing');
assertSafeTestDatabase(['database' => 'myfunlist_test', 'host' => 'localhost'], 'testing');
foreach ([null, false, '', 'development', 'production', 'Testing'] as $environment) {
    try {
        assertSafeTestDatabase($safe, $environment);
    } catch (RuntimeException) {
        continue;
    }
    throw new RuntimeException('Unsafe environment was accepted.');
}
foreach ([[], ['database' => 'myfunlist'], ['database' => 'other_test'],
    ['database' => 'myfunlist_test_backup'], ['host' => 'example.test'], ['host' => '']] as $override) {
    try {
        assertSafeTestDatabase($override === [] ? [] : array_replace($safe, $override), 'testing');
    } catch (RuntimeException) {
        continue;
    }
    throw new RuntimeException('Unsafe database configuration was accepted.');
}
echo "Test database safety checks passed.\n";
