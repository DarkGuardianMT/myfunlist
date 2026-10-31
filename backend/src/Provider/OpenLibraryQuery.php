<?php

declare(strict_types=1);

namespace MyFunList\Provider;

use MyFunList\Http\ApiException;

final class OpenLibraryQuery
{
    public const LANGUAGES = ['en' => 'eng', 'nl' => 'dut', 'tr' => 'tur'];
    public const FIELDS = 'key,title,author_name,first_publish_year,edition_count,language,cover_i,editions,editions.key,editions.title,editions.language,editions.publish_date,editions.isbn,editions.cover_i';

    private function __construct(
        public readonly string $query,
        public readonly string $field,
        public readonly ?string $language,
        public readonly string $languageMode,
        public readonly int $limit,
    ) {
    }

    public static function fromParameters(array $parameters): self
    {
        if (array_diff(array_keys($parameters), ['q', 'field', 'language', 'languageMode', 'limit']) !== []) {
            throw self::invalid();
        }
        foreach ($parameters as $value) {
            if (!is_string($value)) throw self::invalid();
        }
        $query = preg_replace('/^\s+|\s+$/u', '', $parameters['q'] ?? '');
        $field = $parameters['field'] ?? 'general';
        $language = $parameters['language'] ?? null;
        $mode = $parameters['languageMode'] ?? 'preferred';
        $limit = $parameters['limit'] ?? '10';
        if (!is_string($query) || preg_match('/^.{1,200}$/usD', $query) !== 1
            || preg_match('/[\x00-\x1F\x7F]/u', $query) === 1
            || !in_array($field, ['general', 'title', 'author', 'isbn'], true)
            || ($language !== null && !isset(self::LANGUAGES[$language]))
            || !in_array($mode, ['preferred', 'strict'], true)
            || ($mode === 'strict' && $language === null)
            || preg_match('/^(?:[1-9]|10)$/D', $limit) !== 1) {
            throw self::invalid();
        }
        if ($field === 'isbn') {
            $query = str_replace([' ', '-'], '', strtoupper($query));
            if (!self::validIsbn($query)) throw self::invalid();
        }
        return new self($query, $field, $language, $mode, (int) $limit);
    }

    public static function validIsbn(string $isbn): bool
    {
        if (preg_match('/^[0-9]{9}[0-9X]$/D', $isbn) === 1) {
            $sum = 0;
            for ($i = 0; $i < 10; $i++) $sum += (10 - $i) * ($isbn[$i] === 'X' ? 10 : (int) $isbn[$i]);
            return $sum % 11 === 0;
        }
        if (preg_match('/^97[89][0-9]{10}$/D', $isbn) !== 1) return false;
        $sum = 0;
        for ($i = 0; $i < 13; $i++) $sum += (int) $isbn[$i] * ($i % 2 === 0 ? 1 : 3);
        return $sum % 10 === 0;
    }

    public function providerParameters(): array
    {
        // Behandel invoer als tekst, niet als door de bezoeker aangeleverde Solr-operatoren.
        $terms = preg_split('/\s+/u', $this->query);
        $literal = implode(' ', array_map(static fn (string $term): string => '"'
            . str_replace(['\\', '"'], ['\\\\', '\\"'], $term) . '"', $terms));
        $parameters = [
            $this->field === 'general' ? 'q' : $this->field => $this->field === 'isbn' ? $this->query : $literal,
            'limit' => $this->limit,
            'fields' => self::FIELDS,
        ];
        if ($this->language !== null) {
            $parameters['lang'] = $this->language;
            if ($this->languageMode === 'strict') {
                $constraint = 'language:' . self::LANGUAGES[$this->language];
                $parameters['q'] = isset($parameters['q']) ? '(' . $parameters['q'] . ') AND ' . $constraint : $constraint;
            }
        }
        return $parameters;
    }

    private static function invalid(): ApiException
    {
        return new ApiException(422, 'validation_error', 'Check the supplied search parameters.');
    }
}
