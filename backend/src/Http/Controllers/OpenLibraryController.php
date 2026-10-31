<?php

declare(strict_types=1);

namespace MyFunList\Http\Controllers;

use MyFunList\Http\JsonResponse;
use MyFunList\Provider\OpenLibraryPilot;
use MyFunList\Provider\ProviderException;

final class OpenLibraryController
{
    public function __construct(private readonly OpenLibraryPilot $pilot)
    {
    }

    public function search(array $parameters): JsonResponse
    {
        try {
            return JsonResponse::data($this->pilot->search($parameters), headers: ['Cache-Control' => 'no-store']);
        } catch (ProviderException $exception) {
            $unavailable = $exception->status === 429 || ($exception->status >= 500 && $exception->status !== 502);
            return JsonResponse::error($unavailable ? 503 : 502,
                $unavailable ? 'provider_unavailable' : 'provider_error',
                $unavailable ? 'Book search pilot is temporarily unavailable.' : 'Book provider returned invalid data.',
                ['Cache-Control' => 'no-store', ...($unavailable ? ['Retry-After' => '60'] : [])]);
        }
    }
}
