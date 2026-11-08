# Contributing

Use macOS Apple Silicon, Node.js 22.22+ and pnpm 11.0.0. Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test`, `pnpm build` and, with a desktop session, `pnpm test:desktop`.

Keep changes focused. Explain the problem, expected behavior, and validation. Add regression coverage for behavioral fixes where useful. AI-related automated tests should use local mock servers and synthetic images, without live credentials or paid API calls.

Never attach a personal library, SQLite database, API key, provider credential file, private image, or unredacted application settings to an issue or pull request. Check screenshots and logs before sharing them. Use your GitHub noreply commit email if you want to keep your email private.

Dependencies and new image assets must have a redistribution-compatible license and retain required notices. Contributions are provided under the project MIT license; contribute only material you are entitled to share.

This is an early personal project. Review and release timing depend on maintainer availability.

Pull requests and pushes to main run the macOS checks workflow. It uses synthetic images and local mock AI, requires no API keys, and retains test diagnostics for seven days. Check the actual run status before treating the revision as verified.
