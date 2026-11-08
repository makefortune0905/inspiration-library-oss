# Maintainer notes

## Purpose and current status

Inspiration Library is a designer's personal tool for keeping visual references locally and finding them again. Development started in October 2026 through AI-assisted vibe coding. The public repository was opened in November 2026 with a clean history. The maintainer is [makefortune0905](https://github.com/makefortune0905).

The project is early-stage. Verified public adoption and download metrics are not available. No fixed review or release cadence is promised. The current workflow is Chinese-first and targets macOS Apple Silicon.

## Verified use of Codex

Codex assisted in preparing this public edition: inspecting publishable files for sensitive content, separating private history from source, documenting installation and privacy, examining dependency licenses, and running type checks, service tests and builds. The public edition also adds a reproducible GitHub Actions workflow. Public CI results are visible in Actions; an added workflow alone is not a passing result.

Earlier feature-by-feature tool attribution has not been recorded. This document does not claim Codex authored every feature or that the project already has community users.

## Maintenance workflow

1. Reproduce reported behavior with synthetic images and an isolated library.
2. For AI behavior, use a local mock first. Test a live provider only with explicit consent and suitable images; credentials stay local.
3. Make a focused change, inspect the diff and run type checks, service tests and desktop checks where available.
4. Record actual results and known limitations. Review third-party licenses when changing dependencies.
5. Before a public binary release, complete signing/notarization decisions and native dependency redistribution requirements. A successful source build is not a complete release review.

Codex can assist with these steps. The maintainer remains responsible for reviewing changes and deciding what to publish.

## Useful next contributions

- Reproduce the source installation on another Apple Silicon Mac and report exact environment details.
- Report onboarding or search problems with synthetic examples.
- Improve keyboard navigation and accessibility with reproducible checks.
- Expand deterministic AI parsing and failure-recovery regression cases.

These are suggested contributions, not claims of existing community activity.
