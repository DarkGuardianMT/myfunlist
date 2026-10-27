<?php

declare(strict_types=1);

namespace MyFunList\Provider {
    // Vervang alleen in dit testproces cURL-I/O; de echte status- en bodyverwerking blijft actief.
    final class ScriptedCurl
    {
        public static int $status = 200;
        public static string $body = '{"id":42}';
        public static bool $timeout = false;
        public static array $options = [];
    }

    function curl_init(string $url): \CurlHandle|false
    {
        return \curl_init($url);
    }

    function curl_setopt_array(\CurlHandle $handle, array $options): bool
    {
        ScriptedCurl::$options = $options;
        return true;
    }

    function curl_exec(\CurlHandle $handle): bool
    {
        if (ScriptedCurl::$timeout) {
            return false;
        }
        $writer = ScriptedCurl::$options[CURLOPT_WRITEFUNCTION];
        return $writer($handle, ScriptedCurl::$body) === strlen(ScriptedCurl::$body);
    }

    function curl_getinfo(\CurlHandle $handle, int $option): int
    {
        return ScriptedCurl::$status;
    }

    function curl_close(\CurlHandle $handle): void
    {
        \curl_close($handle);
    }
}

namespace {
    use MyFunList\Provider\CurlProviderHttpClient;
    use MyFunList\Provider\ProviderException;
    use MyFunList\Provider\ScriptedCurl;

    require dirname(__DIR__) . '/vendor/autoload.php';

    $checks = 0;
    function verifyProviderHttp(bool $condition, string $message): void
    {
        global $checks;
        $checks++;
        if (!$condition) throw new RuntimeException($message);
    }

    $client = new CurlProviderHttpClient();
    verifyProviderHttp($client->get('https://example.test/fixture?key=fixture-secret') === ['id' => 42],
        'Valid provider JSON should decode normally.');
    $options = ScriptedCurl::$options;
    verifyProviderHttp($options[CURLOPT_CONNECTTIMEOUT] === 3 && $options[CURLOPT_TIMEOUT] === 8
        && $options[CURLOPT_FOLLOWLOCATION] === false && $options[CURLOPT_SSL_VERIFYPEER] === true
        && $options[CURLOPT_SSL_VERIFYHOST] === 2, 'Provider timeout, redirect and TLS protections changed.');

    $cases = [
        [401, 'fixture-secret upstream auth failure', false, 503, 'provider_unavailable'],
        [403, 'fixture-secret upstream forbidden', false, 503, 'provider_unavailable'],
        [404, 'fixture-secret missing', false, 404, 'media_not_found'],
        [429, 'fixture-secret quota', false, 503, 'provider_unavailable'],
        [500, 'fixture-secret server failure', false, 503, 'provider_unavailable'],
        [502, 'fixture-secret upstream gateway', false, 503, 'provider_unavailable'],
        [503, 'fixture-secret unavailable', false, 503, 'provider_unavailable'],
        [400, 'fixture-secret invalid request', false, 502, 'provider_error'],
        [200, '{"id":42}', true, 503, 'provider_unavailable'],
        [200, 'fixture-secret not JSON', false, 502, 'provider_error'],
        [200, '[]', false, 502, 'provider_error'],
        [200, 'null', false, 502, 'provider_error'],
        [200, str_repeat('x', 1048577), false, 503, 'provider_unavailable'],
    ];
    foreach ($cases as [$status, $body, $timeout, $expectedStatus, $expectedCode]) {
        ScriptedCurl::$status = $status;
        ScriptedCurl::$body = $body;
        ScriptedCurl::$timeout = $timeout;
        try {
            $client->get('https://example.test/fixture?key=fixture-secret');
        } catch (ProviderException $exception) {
            verifyProviderHttp($exception->status === $expectedStatus && $exception->errorCode === $expectedCode,
                'Provider HTTP failures must distinguish unavailable services from malformed data.');
            verifyProviderHttp(!str_contains($exception->getMessage(), 'fixture-secret')
                && !str_contains($exception->getMessage(), 'https://'), 'Provider errors leaked upstream information.');
            continue;
        }
        throw new RuntimeException('Expected provider HTTP failure.');
    }
    echo 'Provider HTTP checks passed (', $checks, " assertions; no network requests).\n";
}
