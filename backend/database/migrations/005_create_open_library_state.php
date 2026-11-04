<?php

declare(strict_types=1);

return [<<<'SQL'
CREATE TABLE open_library_state (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    state_json MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    CONSTRAINT chk_open_library_singleton CHECK (id = 1),
    CONSTRAINT chk_open_library_state_size CHECK (OCTET_LENGTH(state_json) <= 2097152)
) ENGINE=InnoDB
SQL,
<<<'SQL'
INSERT INTO open_library_state (id, state_json)
VALUES (1, '{"version":3,"updatedAt":0,"nextRequestAt":0,"reservation":null,"clients":[],"cache":[]}')
SQL];
