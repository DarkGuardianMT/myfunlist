<?php

declare(strict_types=1);

// Alleen lokale CLI-tests met synthetische inputs; geen HTTP-server of applicatiebootstrap.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static fn (): bool => true);
ob_start();
$result = ['accepted' => false];
try {
    if (PHP_SAPI !== 'cli') throw new RuntimeException();
    require dirname(__DIR__, 2) . '/diagnostics/web-worker/Policy.php';
    $input = json_decode(stream_get_contents(STDIN, 16385), true, 24, JSON_THROW_ON_ERROR);
    switch ($input['operation'] ?? '') {
        case 'authorize':
            \MyFunList\WebDiagnostic\Policy::authorize($input['config'], $input['server'], $input['sapi'], $input['now']);
            $result = ['accepted' => true, 'action' => \MyFunList\WebDiagnostic\Policy::action($input['body'], $input['server'])];
            break;
        case 'claim':
            $state = $input['state'] ?? \MyFunList\WebDiagnostic\Protocol::initial($input['nonce']);
            foreach ($input['claims'] as $claim) $state = \MyFunList\WebDiagnostic\Protocol::claim($state, $claim['action'], $claim['now']);
            $result = ['accepted' => true, 'state' => $state];
            break;
        case 'overlap':
            $result = ['accepted' => true, 'value' => \MyFunList\WebDiagnostic\Protocol::overlap(
                $input['holder'], $input['peer'], $input['file'], $input['nonce'])];
            break;
        case 'format':
            $result = ['accepted' => true, 'value' => \MyFunList\WebDiagnostic\Policy::result($input['status'], $input['flags'])];
            break;
        case 'headers':
            $result = ['accepted' => true, 'value' => \MyFunList\WebDiagnostic\Policy::headers()];
            break;
        case 'decode':
            \MyFunList\WebDiagnostic\Policy::decodeConfig($input['raw']);
            $result = ['accepted' => true];
            break;
        case 'template':
            \MyFunList\WebDiagnostic\Policy::config(json_decode(file_get_contents(
                dirname(__DIR__, 2) . '/diagnostics/web-worker/config.example.json'), true, 16, JSON_THROW_ON_ERROR));
            break;
    }
} catch (Throwable) { $result = ['accepted' => false]; }
ob_end_clean();
echo json_encode($result, JSON_THROW_ON_ERROR), "\n";
