<?php

declare(strict_types=1);

namespace MyFunList\Infrastructure;

use RuntimeException;

final class PhpSession
{
    private ?SessionSettings $settings = null;

    public function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $environment = ($_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV')) ?: 'production';
        $host = strtolower((string) parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
        $https = ($_SERVER['HTTPS'] ?? '') === 'on';
        $this->settings = SessionSettings::forRequest($environment, $host, $https);

        $configuredPath = $_ENV['SESSION_SAVE_PATH'] ?? $_SERVER['SESSION_SAVE_PATH'] ?? getenv('SESSION_SAVE_PATH');
        if (is_string($configuredPath) && $configuredPath !== '') {
            session_save_path($configuredPath);
        } elseif (!$this->settings->secure) {
            $localPath = dirname(__DIR__, 2) . '/var/sessions';
            if (!is_dir($localPath) && !mkdir($localPath, 0700, true) && !is_dir($localPath)) {
                throw new RuntimeException('Local session storage is unavailable.');
            }
            session_save_path($localPath);
        }

        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        session_name($this->settings->cookieName);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $this->settings->secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        if (!session_start()) {
            throw new RuntimeException('Session could not be started.');
        }
    }

    public function csrfToken(): string
    {
        $this->start();

        if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];
    }

    public function validCsrf(?string $candidate): bool
    {
        $this->start();
        $stored = $_SESSION['csrf_token'] ?? null;

        return is_string($stored) && is_string($candidate) && hash_equals($stored, $candidate);
    }

    public function userId(): ?string
    {
        $this->start();
        $id = $_SESSION['user_id'] ?? null;

        return is_string($id) && $id !== '' ? $id : null;
    }

    public function authenticate(string $userId): void
    {
        $this->start();
        $_SESSION = [];

        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Session could not be renewed.');
        }

        $_SESSION['user_id'] = $userId;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    public function logout(): void
    {
        $this->start();
        $_SESSION = [];

        if (!session_destroy()) {
            throw new RuntimeException('Session could not be destroyed.');
        }

        $settings = $this->settings;
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $settings?->secure ?? true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
}
