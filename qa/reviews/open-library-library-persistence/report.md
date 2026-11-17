# Open Library real-database persistence follow-up

17 November 2026. PR [#12](https://github.com/DarkGuardianMT/myfunlist/pull/12), branch `review/open-library-library-integration`, implementation checkpoint `b17eb241403df6764318687525ab5b5f8f8852af`. This report supplements the [original QA report and ten inspected screenshots](../open-library-library-integration/report.md), which remain unchanged. See the [integration design](../../../docs/OPEN_LIBRARY_LIBRARY_INTEGRATION.md) and [database safeguards](../../../docs/DEVELOPMENT.md#database-and-http-tests).

## Diagnosis and safe preparation

The previous suite reported only that the isolated database was unavailable; it deliberately suppressed the underlying connection exception. This follow-up's guarded connection reproduced error **1049 (unknown database)**. A read-only server probe identified XAMPP **MariaDB 10.4.32**, port 3306, and confirmed the exact `myfunlist_test` schema was absent. The first process inventory found no daemon; a subsequent probe found the existing XAMPP server available. No server start/stop, service installation, configuration change or XAMPP data-directory replacement was performed. The historical run's exact server state cannot be reconstructed from its generic failure alone; the missing test schema is the confirmed current blocker.

Every database operation used explicit `APP_ENV=testing`, `DB_DATABASE=myfunlist_test`, `DB_HOST=127.0.0.1` and port 3306. Existing local credentials were loaded privately without printing or committing them. The shared safety helper validated the configuration before connection. The preparation connection selected no application database and inspected only server metadata and the exact test-schema name.

Immediately before creation, the schema-absence check was repeated. Creation used the literal `CREATE DATABASE myfunlist_test` without `IF NOT EXISTS`, so an intervening creation would fail rather than reuse an unverified target. A new application connection confirmed `SELECT DATABASE()` was exactly `myfunlist_test` and there were zero tables. Only then did the existing project migration command apply migrations 001–005 to this new disposable schema. No existing development, staging or production database was queried for application data, migrated, reset or modified. No new migration or schema change was added to the repository.

## Commands and results

Commands ran from the repository root with the explicit guarded environment above, PHP 8.2.12 and the installed Composer CLI.

| Check | Actual result |
| --- | --- |
| Guarded connection/read-only diagnosis | Error 1049; exact test schema absent; no writes during diagnosis |
| Fresh target creation and empty-schema check | Passed; only previously absent `myfunlist_test` created |
| `composer --working-dir=backend run migrate` | Passed; existing migrations 001–005 applied |
| `composer --working-dir=backend run migrate:status` | Passed; all five applied |
| `composer --working-dir=backend run test:open-library-library` | **Passed, 28 assertions, exit 0** |
| Post-suite read-only counts | `users`, `media`, `user_media`, `lists`, `list_items`, `rate_limit_counters`: all zero rows; five migration records and the one initialized Open Library coordination row remain |
| `php backend/tests/database_safety.php` | Passed; no database opened by this check |
| Documentation links, scope and whitespace | Passed; 59 local file/heading links, documentation-only diff and `git diff --check`; original QA report and screenshots unchanged |

## Actual persistence coverage

| Behavior | Verified result |
| --- | --- |
| Edition persistence | Selected Edition title and separate Work ID saved; default Want to Read state; Reading/8.5 retained across a fresh service/database connection |
| Duplicate add | Returns `added=false`, keeps one account entry and preserves existing status/rating |
| Ownership | Second account cannot see, update or delete the first account's Library entry; denied mutations return 404; private List access also returns 404 |
| Status and rating | Reading, Finished and Want to Read persist; 0.5, 8.5, 10 and null ratings persist; 8.1 is rejected with 422 by application validation |
| Custom Lists | Membership persists with exact Edition identity; duplicate membership is idempotent; deleting the owned Library entry cascades its membership while preserving the other account's entry |
| Persisted details and re-add | Saved Work association resolves from persisted metadata; re-add reuses shared media; no Open Library HTTP call |
| Google separation | Same title and source ID remain a separate Google Books record; its single provider response is synthetic |
| Cleanup | Suite deletes only its own synthetic users/media, with dependent records removed by real foreign-key cascades; post-run application tables are empty |

No application bug was found, so no application code or test implementation changed. The newly created test schema remains migrated with empty application tables; it was not dropped or reset. The existing XAMPP server was left running.

## Limits and review status

This run uses real MariaDB persistence through the existing application services. It is not an Oracle MySQL run, a real-provider run or a deployed HTTP/browser acceptance test. Provider HTTP and the trusted search cache/admission store are doubles; the separate real shared-budget concurrency suite was not rerun. No full `composer test`, live provider, frontend build, browser test, staging deployment or private release-setting operation was performed in this documentation-only follow-up. Earlier frontend/provider/API evidence remains in the original report.

The local persistence verification gap is resolved. PR review and separately authorized release/acceptance gates remain. No merge, deployment, branch deletion, Hostinger change or GitHub Actions settings change was performed. Preserve the existing QA evidence for review.
