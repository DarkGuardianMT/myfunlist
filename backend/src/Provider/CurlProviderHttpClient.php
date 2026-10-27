<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use CurlHandle;
use JsonException;

final class CurlProviderHttpClient implements ProviderHttpClient
{
    public function get(string $url, array $headers = []): array
    {
        $handle = curl_init($url);
        if (!$handle instanceof CurlHandle) {
            throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
        }

        $body = '';
        curl_setopt_array($handle, [
            CURLOPT_HTTPHEADER => ['Accept: application/json', ...$headers],
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'MyFunList/1.0',
            CURLOPT_WRITEFUNCTION => static function (CurlHandle $_handle, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 1048576) {
                    return 0;
                }
                $body .= $chunk;

                return strlen($chunk);
            },
        ]);

        try {
            if (!curl_exec($handle)) {
                throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
            }
            $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        } finally {
            curl_close($handle);
        }

        if ($status === 404) {
            throw new ProviderException(404, 'media_not_found', 'Media was not found.');
        }
        if (in_array($status, [401, 403, 429], true) || $status >= 500) {
            throw new ProviderException(503, 'provider_unavailable', 'Media provider is unavailable.');
        }
        if ($status !== 200) {
            throw new ProviderException(502, 'provider_error', 'Media provider could not resolve this item.');
        }

        try {
            $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ProviderException(502, 'provider_error', 'Media provider returned invalid data.');
        }
        if (!is_array($decoded) || !str_starts_with(ltrim($body), '{')) {
            throw new ProviderException(502, 'provider_error', 'Media provider returned invalid data.');
        }

        return $decoded;
    }
}
