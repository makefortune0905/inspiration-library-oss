# Validation

## Public-edition checks — 2026-11-08

Environment: macOS Apple Silicon, official standalone Node.js 22.22.2, pnpm 11.0.0, locked dependencies.

- `pnpm typecheck`: passed (initially run with Node.js 24.22.1).
- `pnpm test`: 11 tests passed with Node.js 22.22.2; no live API calls or user libraries.
- `pnpm build`: passed with Node.js 22.22.2; Rollup emitted non-fatal annotation warnings from Zod.
- Desktop UI tests: not run; Electron runtime download failed in this environment. No desktop pass is claimed.
- Packaged app: not built or verified in this public-edition check. No binary release is included.

Installation initially hit registry download timeouts. A checksum-matching official registry tarball was fetched separately and supplied through a loopback-only temporary cache endpoint. The committed lockfile was restored byte-for-byte. Installation scripts were initially skipped, then esbuild/Sharp setup was run explicitly; Electron runtime installation failed with a network fetch error.

The application's bundled tool runtime could not load native modules because of macOS signing restrictions. Standalone official Node.js resolved the service-test and build failures; no source change or system security change was needed.

## Test scope

`tests/library.test.ts` covers copying original bytes, format handling, dimensions, duplicate detection, metadata persistence, library relocation, EXIF orientation, GIF preservation, corrupt/missing files, import recovery, permission errors, simulated disk-full handling and stable pagination of 5,000 records.

`tests/ai.test.ts` uses local mock HTTP servers for analysis, manual corrections, smart search and caching, queue failure/retry/pause, restart recovery, schema migration, split SSE parsing, output validation and redirect credential protection.

`tests/desktop.spec.ts` contains four Electron scenarios: import/browse/edit/search/clipboard/restart; initial library creation; virtualized browsing of 5,000 database records; and AI settings encryption plus mocked analysis/search.

## Run the checks

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:desktop
```

Desktop tests require an unlocked, usable macOS session. They create isolated temporary settings/libraries and synthetic images. Screenshots and traces go to ignored test-output directories. Do not set `LIBRARY_ROOT` to a personal library when experimenting with tests. Automated AI tests do not need credentials.

To test a locally packaged app after `pnpm package:mac`:

```sh
PACKAGED_APP="$PWD/release/mac-arm64/灵感库.app/Contents/MacOS/灵感库" pnpm exec playwright test
```

The 5,000-record checks reuse test images and measure query/render behavior, not full ingestion throughput of 5,000 large images. Disk-full handling is simulated; the real disk is not filled. Live provider compatibility, paid usage, manual UI acceptance, Windows/Linux support, code signing/notarization and binary-license compliance are not established by service tests or a successful build.
