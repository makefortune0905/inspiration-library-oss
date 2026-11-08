# Inspiration Library · 灵感库

[![macOS checks](https://github.com/makefortune0905/inspiration-library-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/makefortune0905/inspiration-library-oss/actions/workflows/ci.yml)

A local-first macOS visual reference library for designers. Import images, keep originals on disk, and find references through local keywords or optional AI-assisted analysis and search.

[中文使用说明](README.zh-CN.md) · [Testing](VALIDATION.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Maintainer notes](MAINTENANCE.md)

## Status

Early personal project, started in October 2026 by a designer through AI-assisted vibe coding. This public edition starts with a clean Git history. It does not include personal image libraries, credentials, or the private development history. Community adoption and long-term maintenance metrics have not been established.

The interface and AI descriptions are primarily in Chinese. The current target is macOS on Apple Silicon; Windows and Linux are not validated. There is no signed or notarized release installer.

## Features

- Import JPEG, PNG, WebP and GIF files or folders; drag and drop is supported.
- Copy originals without rewriting them, deduplicate by SHA-256, and generate separate thumbnails.
- Browse a virtualized image grid; edit notes, tags and categories.
- Search locally by keywords without an AI connection.
- Optionally analyze design characteristics and rank search results through a compatible vision API.
- Preserve local library metadata in SQLite and recover incomplete imports.

Browser capture, video analysis, cloud sync and image-vector similarity search are not implemented.

## Install from source

Requirements: macOS on Apple Silicon, Node.js 22.22 or newer with `node:sqlite`, and pnpm 11.0.0. If Corepack is available, run `corepack enable` and use the package manager pinned in `package.json`. Otherwise install pnpm 11.0.0 using its official instructions.

```sh
git clone https://github.com/makefortune0905/inspiration-library-oss.git
cd inspiration-library-oss
pnpm install --frozen-lockfile
pnpm dev
```

No API key is required to start the app or run automated tests.

## Build and test

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:desktop
pnpm package:mac
```

The unsigned development app is generated at `release/mac-arm64/灵感库.app`. Packaging is currently configured only for Apple Silicon. Tests create synthetic images and isolated temporary libraries; desktop tests require a usable macOS graphical session. See [VALIDATION.md](VALIDATION.md) for scope and current results.

## Data and AI privacy

On first launch, create an empty library or open an existing one. The default location is `~/Pictures/灵感库`. Originals live under `原图/`; the hidden `.library/` folder contains SQLite metadata, thumbnails and staging files. Importing copies files and leaves the source intact. Quit the app before backing up the complete library, including `.library/`. External file renames are not automatically reconciled.

AI is disabled by default. Configure an endpoint, model and your own API key in Settings. Compatible endpoints must support images and strict JSON Schema through Responses or Chat Completions. Compatibility depends on the provider and model.

When enabled, analysis sends a JPEG preview (at most 1600 pixels on the longest edge), filenames, notes and manual tags to the configured provider. Smart search sends your query and candidate text analyses. Original files stay local. The API key is encrypted using Electron `safeStorage` in the application settings directory; it is not stored in the image library. Provider retention and billing policies apply. Local keyword search remains available without AI.

## Architecture

React + TypeScript render the desktop UI. Electron owns native dialogs, clipboard and a restricted preload IPC bridge. A worker manages SQLite, import queues, Sharp image processing and AI tasks. Images are served through an asset-ID-based local protocol.

## Contribute

Bug reports and small, focused pull requests are welcome in this public repository. Use synthetic examples, remove personal paths and credentials from logs, and include reproducible steps. See [CONTRIBUTING.md](CONTRIBUTING.md). No response-time or release schedule is promised.

## License

Project source code and project-owned icon assets are licensed under the [MIT License](LICENSE). Imported images belong to their respective rights holders and are not included. Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
