<?php

declare(strict_types=1);

use MyFunList\Config;
use MyFunList\Infrastructure\Database;
use MyFunList\Infrastructure\SessionSettings;
use MyFunList\RateLimit\RateLimiter;

require dirname(__DIR__) . '/config/environment.php';

final class ApiClient
{
    private array $cookies = [];

    public function __construct(private readonly string $baseUrl)
    {
    }

    public function cookie(string $name): ?string
    {
        return $this->cookies[$name] ?? null;
    }

    public function request(string $method, string $path, ?string $body = null, ?string $csrf = null): array
    {
        $headers = ['Accept: application/json'];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($csrf !== null) {
            $headers[] = 'X-CSRF-Token: ' . $csrf;
        }
        if ($this->cookies !== []) {
            $pairs = [];
            foreach ($this->cookies as $name => $value) {
                $pairs[] = $name . '=' . $value;
            }
            $headers[] = 'Cookie: ' . implode('; ', $pairs);
        }

        $context = stream_context_create(['http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $body ?? '',
            'ignore_errors' => true,
            'timeout' => 5,
        ]]);
        $response = file_get_contents($this->baseUrl . $path, false, $context);
        if ($response === false) {
            throw new RuntimeException('The local API did not respond.');
        }

        $status = (int) (preg_match('/^HTTP\/\S+ (\d{3})/', $http_response_header[0], $match)
            ? $match[1] : 0);
        foreach ($http_response_header as $header) {
            if (stripos($header, 'Set-Cookie: ') !== 0) {
                continue;
            }
            $pair = explode(';', substr($header, 12))[0];
            [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
            if ($value === '' || str_contains(strtolower($header), 'max-age=0')) {
                unset($this->cookies[$name]);
            } else {
                $this->cookies[$name] = $value;
            }
        }

        return [
            'status' => $status,
            'body' => $response,
            'json' => $response === '' ? null : json_decode($response, true, 512, JSON_THROW_ON_ERROR),
            'headers' => $http_response_header,
        ];
    }
}

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function jsonBody(array $data): string
{
    return json_encode($data, JSON_THROW_ON_ERROR);
}

function csrf(ApiClient $client): string
{
    $response = $client->request('GET', '/api/v1/auth/csrf');
    $token = $response['json']['data']['csrfToken'] ?? null;
    check($response['status'] === 200 && is_string($token) && strlen($token) === 64,
        'CSRF endpoint must issue a random-looking token.');

    return $token;
}

require __DIR__ . '/support/database.php';
$config = Config::database();
assertSafeTestDatabase($config, $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV'));
check($config['database'] === 'myfunlist_test'
    && in_array($config['host'], ['127.0.0.1', 'localhost'], true),
    'Auth tests may use only the local myfunlist_test database.');
$database = (new Database())->connect();
check($database->query('SELECT DATABASE()')->fetchColumn() === 'myfunlist_test',
    'Auth test connection selected the wrong database.');

$production = SessionSettings::forRequest('production', 'myfunlist.app', true);
check($production->secure && $production->cookieName === '__Host-myfunlist_session',
    'Production sessions must use Secure host-only cookies.');
$local = SessionSettings::forRequest('testing', '127.0.0.1', false);
check(!$local->secure && $local->cookieName === 'myfunlist_session',
    'Local HTTP sessions must remain usable.');

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
check($socket !== false, 'Could not reserve a local API port.');
$address = stream_socket_get_name($socket, false);
fclose($socket);
$port = (int) substr(strrchr($address, ':'), 1);
$baseUrl = 'http://127.0.0.1:' . $port;
$serverLog = dirname(__DIR__) . '/var/auth-test-server.log';
if (!is_dir(dirname($serverLog))) {
    mkdir(dirname($serverLog), 0700, true);
}
$environment = array_merge(getenv(), array_filter($_ENV, 'is_string'), [
    'APP_ENV' => 'testing',
    'DB_DATABASE' => 'myfunlist_test',
]);
$process = proc_open(
    [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', 'public', 'public/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
    $pipes,
    dirname(__DIR__),
    $environment,
);
check(is_resource($process), 'Could not start the local API server.');
fclose($pipes[0]);

$suffix = bin2hex(random_bytes(8));
$email = 'auth-' . $suffix . '@example.test';
$rehashEmail = 'rehash-' . $suffix . '@example.test';
$otherEmail = 'other-' . $suffix . '@example.test';
$password = bin2hex(random_bytes(16));
$wrongPassword = bin2hex(random_bytes(16));
$changedPassword = bin2hex(random_bytes(16));

try {
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        $health = @file_get_contents($baseUrl . '/api/v1/health');
        if ($health !== false) {
            $ready = true;
            break;
        }
        usleep(100000);
    }
    check($ready, 'Local API server did not start.');

    $client = new ApiClient($baseUrl);
    $csrfResponse = $client->request('GET', '/api/v1/auth/csrf');
    $token = $csrfResponse['json']['data']['csrfToken'] ?? null;
    check($csrfResponse['status'] === 200 && is_string($token) && strlen($token) === 64,
        'CSRF endpoint must issue a token.');
    $initialSession = $client->cookie('myfunlist_session');
    check(is_string($initialSession) && $initialSession !== '', 'CSRF request must create a session.');
    $cookieHeaders = implode("\n", $csrfResponse['headers']);
    check(str_contains($cookieHeaders, 'myfunlist_session=')
        && str_contains($cookieHeaders, 'HttpOnly')
        && str_contains($cookieHeaders, 'SameSite=Lax')
        && !str_contains($cookieHeaders, 'Secure'),
        'Local HTTP cookie attributes are incorrect.');

    $anonymous = $client->request('GET', '/api/v1/auth/me');
    check($anonymous['status'] === 401 && $anonymous['json']['error']['code'] === 'unauthenticated',
        'Anonymous /me must be rejected.');

    $registerBody = jsonBody(['email' => '  ' . strtoupper($email) . '  ', 'password' => $password]);
    check($client->request('POST', '/api/v1/auth/register', $registerBody)['status'] === 403,
        'Registration must reject a missing CSRF token.');
    check($client->request('POST', '/api/v1/auth/register', $registerBody, 'wrong')['status'] === 403,
        'Registration must reject an invalid CSRF token.');
    check($client->request('POST', '/api/v1/auth/register', '{', $token)['status'] === 400,
        'Registration must reject malformed JSON.');
    check($client->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => 'invalid', 'password' => $password,
    ]), $token)['status'] === 422, 'Registration must validate email.');
    check($client->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => $email, 'password' => 'short',
    ]), $token)['status'] === 422, 'Registration must validate password length.');
    check($client->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => $email, 'password' => $password, 'userId' => '1',
    ]), $token)['status'] === 422, 'Registration must reject unexpected fields.');

    $registered = $client->request('POST', '/api/v1/auth/register', $registerBody, $token);
    $user = $registered['json']['data']['user'] ?? null;
    check($registered['status'] === 201 && is_array($user)
        && is_string($user['id'] ?? null) && ($user['email'] ?? null) === $email,
        'Registration must return normalized email and string ID.');
    check(!str_contains($registered['body'], 'password') && !str_contains($registered['body'], 'session'),
        'Registration response exposed a secret.');
    check($client->cookie('myfunlist_session') !== $initialSession,
        'Registration must rotate the session ID.');
    $stored = $database->prepare('SELECT password_hash FROM users WHERE email = ?');
    $stored->execute([$email]);
    $hash = $stored->fetchColumn();
    check(is_string($hash) && $hash !== $password && password_verify($password, $hash),
        'Registration must store a verifiable hash.');

    $me = $client->request('GET', '/api/v1/auth/me');
    check($me['status'] === 200 && $me['json']['data']['user'] === $user,
        'Authenticated /me must return the registered user.');
    check($client->request('POST', '/api/v1/auth/logout', '{}', $token)['status'] === 403,
        'Authentication must rotate the CSRF token.');
    check($client->request('POST', '/api/v1/auth/logout')['status'] === 403,
        'Logout must require CSRF.');
    $authenticatedToken = csrf($client);
    check($authenticatedToken !== $token, 'CSRF token did not rotate.');
    $other = new ApiClient($baseUrl);

    check(array_key_exists('displayName', $user) && $user['displayName'] === null
        && is_string($user['createdAt'] ?? null)
        && str_ends_with($user['createdAt'], 'Z')
        && !array_key_exists('password_hash', $user),
        'Public user must expose nullable display name and UTC creation date without a hash.');
    check($client->request('GET', '/api/v1/profile')['json']['data']['user'] === $user,
        'Authenticated Profile GET must return the current user.');
    check($other->request('GET', '/api/v1/profile')['status'] === 401,
        'Anonymous Profile GET must return 401.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody(['displayName' => 'A']))['status'] === 403,
        'Profile mutation must require CSRF.');
    foreach (['   ', str_repeat('a', 81), "bad\nname"] as $invalidName) {
        check($client->request('PATCH', '/api/v1/profile', jsonBody([
            'displayName' => $invalidName,
        ]), $authenticatedToken)['status'] === 422, 'Invalid display name must be rejected.');
    }
    $named = $client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => '  José 李  ',
    ]), $authenticatedToken);
    check($named['status'] === 200 && $named['json']['data']['user']['displayName'] === 'José 李'
        && $client->request('GET', '/api/v1/profile')['json']['data']['user']['displayName'] === 'José 李',
        'Unicode display name must be trimmed and persist.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => 'Updated',
    ]), $authenticatedToken)['json']['data']['user']['displayName'] === 'Updated',
        'Display name must be updateable.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => 'Attack', 'userId' => '999999',
    ]), $authenticatedToken)['status'] === 422, 'Client-provided user ID must be rejected.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => null,
    ]), $authenticatedToken)['json']['data']['user'] === $user,
        'Null must clear a display name.');

    $otherToken = csrf($other);
    check($other->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => $rehashEmail, 'password' => $password,
    ]), $authenticatedToken)['status'] === 403,
        'A CSRF token from another session must be rejected.');
    $duplicate = $other->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => strtoupper($email), 'password' => $password,
    ]), $otherToken);
    check($duplicate['status'] === 409 && $duplicate['json']['error']['code'] === 'email_in_use',
        'Duplicate normalized email must be rejected.');
    $otherRegistration = $other->request('POST', '/api/v1/auth/register', jsonBody([
        'email' => $otherEmail, 'password' => $password,
    ]), $otherToken);
    $otherId = $otherRegistration['json']['data']['user']['id'] ?? null;
    check($otherRegistration['status'] === 201 && is_string($otherId), 'Second account must register.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => 'Intruder', 'userId' => $otherId,
    ]), $authenticatedToken)['status'] === 422
        && $other->request('GET', '/api/v1/profile')['json']['data']['user']['displayName'] === null,
        'User A must not be able to edit User B.');

    $logout = $client->request('POST', '/api/v1/auth/logout', null, $authenticatedToken);
    check($logout['status'] === 204 && $logout['body'] === ''
        && $client->cookie('myfunlist_session') === null,
        'Logout must clear the cookie and return no body.');
    check($client->request('GET', '/api/v1/auth/me')['status'] === 401,
        '/me must reject the logged-out session.');

    $loginToken = csrf($client);
    $preLoginSession = $client->cookie('myfunlist_session');
    $wrong = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $email, 'password' => $wrongPassword,
    ]), $loginToken);
    $unknown = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => 'unknown-' . $suffix . '@example.test', 'password' => $password,
    ]), $loginToken);
    check($wrong['status'] === 401 && $unknown['status'] === 401
        && $wrong['json'] === $unknown['json']
        && $wrong['json']['error']['code'] === 'invalid_credentials',
        'Unknown email and wrong password must have the same generic response.');
    $extraLogin = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $email, 'password' => $password, 'userId' => '1',
    ]), $loginToken);
    check($extraLogin['status'] === 401 && $extraLogin['json'] === $wrong['json'],
        'Login must reject unexpected fields without revealing account details.');
    $login = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => strtoupper($email), 'password' => $password,
    ]), $loginToken);
    check($login['status'] === 200 && $login['json']['data']['user'] === $user,
        'Login must accept normalized email and correct password.');
    check($client->cookie('myfunlist_session') !== $preLoginSession,
        'Login must rotate the session ID.');
    check($client->request('GET', '/api/v1/auth/me')['status'] === 200,
        '/me must recognize the logged-in session.');

    $passwordToken = csrf($client);
    $changeBody = jsonBody(['currentPassword' => $password, 'newPassword' => $changedPassword]);
    check($client->request('POST', '/api/v1/account/password', $changeBody)['status'] === 403,
        'Password change must require CSRF.');
    check($other->request('POST', '/api/v1/account/password', $changeBody, $passwordToken)['status'] === 403,
        'Another session must not use this CSRF token.');
    check($client->request('POST', '/api/v1/account/password', jsonBody([
        'currentPassword' => $wrongPassword, 'newPassword' => $changedPassword,
    ]), $passwordToken)['status'] === 422, 'Wrong current password must be rejected.');
    check($client->request('POST', '/api/v1/account/password', jsonBody([
        'currentPassword' => $password, 'newPassword' => 'short',
    ]), $passwordToken)['status'] === 422, 'Short new password must be rejected.');
    check($client->request('POST', '/api/v1/account/password', jsonBody([
        'currentPassword' => $password, 'newPassword' => $changedPassword, 'userId' => '1',
    ]), $passwordToken)['status'] === 422, 'Password change must reject unexpected fields.');
    $beforeChangeSession = $client->cookie('myfunlist_session');
    $change = $client->request('POST', '/api/v1/account/password', $changeBody, $passwordToken);
    check($change['status'] === 204 && $change['body'] === ''
        && $client->cookie('myfunlist_session') !== $beforeChangeSession,
        'Password change must rotate session ID and return no secret.');
    check($client->request('GET', '/api/v1/auth/me')['json']['data']['user'] === $user,
        'Password change must keep current session authenticated.');
    check($client->request('PATCH', '/api/v1/profile', jsonBody([
        'displayName' => 'Nope',
    ]), $passwordToken)['status'] === 403,
        'Password change must rotate CSRF token.');
    $newToken = csrf($client);
    check($newToken !== $passwordToken, 'New CSRF token must differ.');
    $stored->execute([$email]);
    $changedHash = $stored->fetchColumn();
    check(is_string($changedHash) && $changedHash !== $changedPassword
        && password_verify($changedPassword, $changedHash) && !password_verify($password, $changedHash),
        'New password must be hashed and replace old password.');
    check($client->request('POST', '/api/v1/auth/logout', null, $newToken)['status'] === 204,
        'Rotated session must still log out.');
    check($client->request('POST', '/api/v1/account/password', $changeBody, csrf($client))['status'] === 401,
        'Anonymous password change must return 401.');
    $reloginToken = csrf($client);
    check($client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $email, 'password' => $password,
    ]), $reloginToken)['status'] === 401, 'Old password must no longer log in.');
    check($client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $email, 'password' => $changedPassword,
    ]), $reloginToken)['status'] === 200, 'New password must log in.');

    $legacyHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]);
    $insert = $database->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $insert->execute([$rehashEmail, $legacyHash]);
    $rehashClient = new ApiClient($baseUrl);
    $rehashToken = csrf($rehashClient);
    $rehashLogin = $rehashClient->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $rehashEmail, 'password' => $password,
    ]), $rehashToken);
    check($rehashLogin['status'] === 200, 'Login must accept an older valid password hash.');
    $stored->execute([$rehashEmail]);
    $newHash = $stored->fetchColumn();
    check(is_string($newHash) && $newHash !== $legacyHash
        && password_verify($password, $newHash), 'Login must rehash outdated hashes.');

    $database->exec('DELETE FROM rate_limit_counters');
    $limiter = new RateLimiter(new Database(), require dirname(__DIR__) . '/config/rate_limits.php');
    $missingEmail = 'limited-missing-' . $suffix . '@example.test';
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $limiter->check('login_account', $email);
        $limiter->check('login_account', $missingEmail);
    }
    $loginCsrf = csrf($client);
    $limitedExisting = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => strtoupper($email), 'password' => $wrongPassword,
    ]), $loginCsrf);
    $limitedMissing = $client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => $missingEmail, 'password' => $wrongPassword,
    ]), $loginCsrf);
    check($limitedExisting['status'] === 429 && $limitedExisting['json'] === $limitedMissing['json']
        && $limitedExisting['json']['error']['code'] === 'rate_limited'
        && preg_match('/^Retry-After: [1-9][0-9]*$/mi', implode("\n", $limitedExisting['headers'])) === 1,
        'Existing and missing accounts must receive the same 429 with Retry-After.');
    $rows = json_encode($database->query('SELECT * FROM rate_limit_counters')->fetchAll(), JSON_THROW_ON_ERROR);
    check(!str_contains($rows, $email) && !str_contains($rows, $missingEmail)
        && !str_contains($rows, '127.0.0.1'), 'Limiter rows must not contain raw email or IP.');
    check($client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => 'unlimited-' . $suffix . '@example.test', 'password' => $wrongPassword,
    ]), $loginCsrf)['status'] === 401, 'Separate account subjects must remain independent.');

    $database->exec('DELETE FROM rate_limit_counters');
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $limiter->check('login_ip', '127.0.0.1');
    }
    check($client->request('POST', '/api/v1/auth/login', jsonBody([
        'email' => 'fresh-' . $suffix . '@example.test', 'password' => $wrongPassword,
    ]), $loginCsrf)['status'] === 429, 'Login IP policy must block independently of account policy.');

    $database->exec('DELETE FROM rate_limit_counters');
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $limiter->check('register_ip', '127.0.0.1');
        $limiter->check('password_user', $user['id']);
    }
    check($client->request('POST', '/api/v1/auth/register', $registerBody, $loginCsrf)['status'] === 429,
        'Registration traffic must be bounded by the observed IP.');
    check($client->request('POST', '/api/v1/account/password', jsonBody([
        'currentPassword' => $changedPassword, 'newPassword' => $password,
    ]), $loginCsrf)['status'] === 429, 'Password guessing must be bounded per authenticated user.');
    check($other->request('POST', '/api/v1/account/password', jsonBody([
        'currentPassword' => $wrongPassword, 'newPassword' => $password,
    ]), csrf($other))['status'] === 422, 'Another user must not share the password limit.');
    $database->exec('DELETE FROM rate_limit_counters');

    echo "Auth HTTP and rate-limit tests passed.\n";
} finally {
    $delete = $database->prepare('DELETE FROM users WHERE email IN (?, ?, ?)');
    $delete->execute([$email, $rehashEmail, $otherEmail]);
    proc_terminate($process);
    proc_close($process);
    @unlink($serverLog);
}
