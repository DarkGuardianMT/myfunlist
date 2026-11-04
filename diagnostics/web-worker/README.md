# Temporary web-worker diagnostic package

**Review material only. Not installed, armed, uploaded or executed over HTTP.** This package is outside the automatically deployed public application tree and has no application route, workflow trigger or build integration.

Read the [installation, protection, execution and complete-removal runbook](../../docs/BOOK_SEARCH_V2_PHASE2C_WEB_WORKER_DIAGNOSTICS.md). Independent code review and separate owner approval are required before installation, server changes or HTTP execution. The example configuration is deliberately invalid and disarmed. Never put a populated configuration or credentials in Git.

Only `endpoint.php`, `Policy.php`, `Fixture.php` and `manage.php` belong in a future owner-approved private server installation, outside document roots and the checkout, with a server-protected mapping of **only** `endpoint.php` into the existing staging PHP pool. The runner and its credentials stay on the owner's trusted computer. Copying a file into `backend/public`, `dist`, an upload tree or the application router is prohibited.
