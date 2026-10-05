<?php

declare(strict_types=1);

return [<<<'SQL'
CREATE TABLE rate_limit_counters (
    policy VARCHAR(40) NOT NULL,
    subject_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_start BIGINT UNSIGNED NOT NULL,
    request_count INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (policy, subject_hash, window_start),
    INDEX idx_rate_limit_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL];
