<?php

declare(strict_types=1);

return [
    <<<'SQL'
CREATE TABLE tier_lists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NULL,
    allowed_types SET('movie', 'tv', 'book', 'game') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    creation_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    creation_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_tier_lists_user_id (user_id, id),
    UNIQUE KEY uq_tier_lists_creation (user_id, creation_key),
    CONSTRAINT fk_tier_lists_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_tier_lists_types CHECK (allowed_types <> ''),
    CONSTRAINT chk_tier_lists_revision CHECK (revision > 0),
    CONSTRAINT chk_tier_lists_creation CHECK ((creation_key IS NULL) = (creation_hash IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
    <<<'SQL'
CREATE TABLE tier_list_tiers (
    list_id BIGINT UNSIGNED NOT NULL,
    tier_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(40) NOT NULL,
    color VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (list_id, tier_key),
    UNIQUE KEY uq_tier_list_tier_position (list_id, position),
    CONSTRAINT fk_tier_list_tiers_list FOREIGN KEY (list_id) REFERENCES tier_lists (id) ON DELETE CASCADE,
    CONSTRAINT chk_tier_list_color CHECK (color IN ('Lime', 'Amber', 'Coral', 'Teal', 'Violet', 'Slate')),
    CONSTRAINT chk_tier_list_lane CHECK (
        (tier_key = 'unranked' AND position = 12 AND BINARY name = 'Unranked' AND color = 'Slate')
        OR (tier_key <> 'unranked' AND position < 12)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
    <<<'SQL'
CREATE TABLE tier_list_items (
    list_id BIGINT UNSIGNED NOT NULL,
    tier_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (list_id, media_id),
    UNIQUE KEY uq_tier_list_item_position (list_id, tier_key, position),
    INDEX idx_tier_list_items_media (media_id),
    CONSTRAINT fk_tier_list_items_tier FOREIGN KEY (list_id, tier_key)
        REFERENCES tier_list_tiers (list_id, tier_key) ON DELETE CASCADE,
    CONSTRAINT fk_tier_list_items_media FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE RESTRICT,
    CONSTRAINT chk_tier_list_item_position CHECK (position < 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
];
