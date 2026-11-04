# Web-worker readiness test investigation

4 November 2026. Candidate test correction from `a31e7343d5b20c02ff172874ce792ac3722e890e`, on `review/fix-web-worker-readiness-test`. **Linux verification remains outstanding; this is not a verified fix of the Linux failure.** Independent review is required before merge. No deployment, endpoint installation, HTTP diagnostics, Hostinger operation or Open Library activation accompanies this change.

## Failure and cause

The [failed staging workflow](https://github.com/DarkGuardianMT/myfunlist/actions/runs/41746436547) ran all 346 tests on Linux: 345 passed, one failed, none skipped. Its stack identifies the `passed(invoke('ready'))` assertion in [the fixture test](../tests/webWorkerFixture.test.js), originally line 87: PHP exited 1 instead of 0. It does not expose an internal PHP exception, because the helper deliberately returns only an inconclusive result. Deployment steps were skipped.

The test starts the holder using asynchronous `spawn()` and writes its configuration with `child.stdin.end()`. It immediately calls `spawnSync()` for readiness. That blocks Node's event loop before asynchronous process-start/stdin delivery can complete. The [PHP helper](../tests/support/web-worker-fixture.php) reads stdin through EOF before constructing the fixture. The ready process can therefore spend its entire two-second wait without a configured holder. After readiness times out, Node resumes and the holder can finally proceed; the protocol has already failed closed.

This is a test synchronization defect, rather than evidence that a sequential worker may pass or a lock is broken. [Fixture.php](../diagnostics/web-worker/Fixture.php) already permits readiness to arrive before the holder, waits for its private control record within two seconds, and requires the recorded distinct holder process and `holding` ledger stage. The successful cross-process protocol test in the same failed run and the source inspection support this diagnosis. The exact internal PHP failure was not logged; the mechanism was independently reproduced locally as described below. Production safety checks remain unchanged.

## Focused correction

- Keep preparation/attestation synchronous before starting concurrent work. Use the existing asynchronous transport for both readiness and attempted HTTP-path cleanup while the holder is pending. No arbitrary sleeps, retries or timeout increases are added.
- Exercise both holder-first and ready-first launch orders in independent disposable local workspaces. Readiness completion, rather than a guessed startup delay, gates cleanup.
- Validate complete response schemas and absence of transport uncertainty; require readiness pass, cleanup inconclusive, a still-pending holder before/after cleanup, retained workspace and the cleanup admission's `closing` ledger stage.
- Always join the holder in `finally` before the test sandbox can be removed, including on assertion failure. Require the holder to finish inconclusively without contender acknowledgement, then verify offline cleanup and workspace absence. Concurrency must remain false for this negative case.

Only the test and this review note change. The PHP protocol, endpoint, runner, three-second holder limit, two-second readiness limit, process deadlines, lock/inode protections, request limits and application/deployment behavior remain unchanged. `PROJECT_CONTEXT.md` needs no architectural update; original readiness evidence is preserved.

## Local evidence and remaining gate

- A disposable Windows PHP/stdin transport experiment reproduced the blocked-event-loop mechanism in **10/10** paired attempts: synchronous readiness expired with no marker before Node yielded, then the holder successfully wrote its synthetic marker. Asynchronous readiness succeeded in **10/10** paired attempts using the existing two-second readiness bound. This only checks transport scheduling, not Linux locking or CGI/FastCGI workers. An earlier 500ms experimental probe failed under Windows process-start delays; no production/test deadline was widened in response.
- `node --test tests/webWorkerDiagnostics.test.js tests/webWorkerFixture.test.js`: **32 passed, six Linux-only skipped, zero failed**.
- `npm test`: **334 passed, 12 Linux-only skipped, zero failed**. Both launch-order variants are inside a skipped Linux test on this host and have not been executed here.
- `npm run build` passes; generated frontend files contain no diagnostic PHP/package/private configuration. Node syntax checks and PHP lint for all four package files and both helpers pass. Database-safety, provider and API fixture suites pass, with expected negative-case messages and no live provider/database access.
- WSL reports it is not installed. Docker, Podman, QEMU, Multipass and Vagrant commands are unavailable. No Linux runtime was installed or remote test/deployment dispatched. **Repeated Linux execution was unavailable, so the original Linux failure cannot yet be declared fixed.** No browser QA or actual web-worker verification is claimed.

Before accepting the correction, run the focused tests repeatedly on an isolated Linux/PHP 8.2+ host with POSIX support, require zero failures/skips, then run the full suite/build and relevant PHP checks there. For example, from the review checkout on that isolated host:

```bash
set -euo pipefail
node -e 'if (process.platform !== "linux") process.exit(1)'
php -r 'exit(PHP_OS_FAMILY === "Linux" && PHP_VERSION_ID >= 80200 && function_exists("posix_geteuid") ? 0 : 1);'
for attempt in {1..10}; do
  node --test tests/webWorkerDiagnostics.test.js tests/webWorkerFixture.test.js tests/cliLockWorker.test.js
done
npm test
npm run build
```

These commands use only synthetic disposable local fixtures and no HTTP listener. They have **not** been run on Linux for this correction. A later approved merge/deployment remains a separate action; do not use Hostinger or a diagnostic endpoint as a substitute for local Linux regression evidence.
