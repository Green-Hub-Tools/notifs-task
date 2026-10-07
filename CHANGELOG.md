# Changelog

## Unreleased

### Changed
- Approval notifications no longer mention (`cc @owner`) the PR owner when auto-merge is enabled on the PR, since the PR will be merged without further action from them.

- Mergeable status on approval is read through the GitHub API (`@actions/github`) instead of the `gh` CLI.

### Added
- Unit tests for the approval notification content.
- Dependabot: grouped minor/patch updates.
- CI: automatic GitHub release (tag `vMAJOR.MINOR` from `package.json`) when the version is bumped.

### Fixed
- CI uses `npm ci` for reproducible builds; `package.json` version aligned with releases (1.33.0).

### Dependencies
- Bump prettier, brace-expansion, undici, eslint, jest and eslint-plugin-jest (Dependabot).
