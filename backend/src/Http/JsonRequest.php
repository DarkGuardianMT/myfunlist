<?php

declare(strict_types=1);

namespace MyFunList\Http;

use JsonException;
use stdClass;

final class JsonRequest
{
    public static function body(int $maxBytes = 4096, int $tooLargeStatus = 400): array
    {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        if ($contentType !== 'application/json') {
            throw new ApiException(400, 'invalid_request', 'Send a JSON request body.');
        }

        $body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        if ($body === false) {
            throw new ApiException(400, 'invalid_request', 'Request body could not be read.');
        }
        if (strlen($body) > $maxBytes) {
            throw new ApiException($tooLargeStatus,
                $tooLargeStatus === 413 ? 'request_too_large' : 'invalid_request',
                'Request body is too large.');
        }

        try {
            $decoded = json_decode($body, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiException(400, 'invalid_json', 'Request body must be valid JSON.');
        }

        if (!$decoded instanceof stdClass) {
            throw new ApiException(400, 'invalid_json', 'Request body must be a JSON object.');
        }

        return get_object_vars($decoded);
    }
}
