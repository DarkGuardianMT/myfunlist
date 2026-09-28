<?php

declare(strict_types=1);

return [
    <<<'SQL'
CREATE TABLE lists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_lists_user_updated (user_id, updated_at, id),
    CONSTRAINT fk_lists_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
    <<<'SQL'
CREATE TABLE list_items (
    list_id BIGINT UNSIGNED NOT NULL,
    user_media_id BIGINT UNSIGNED NOT NULL,
    added_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (list_id, user_media_id),
    INDEX idx_list_items_user_media (user_media_id),
    CONSTRAINT fk_list_items_list FOREIGN KEY (list_id) REFERENCES lists (id) ON DELETE CASCADE,
    CONSTRAINT fk_list_items_user_media FOREIGN KEY (user_media_id) REFERENCES user_media (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
];
