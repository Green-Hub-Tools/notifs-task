# Changelog

## 1.34.0 - 2026-10-07

### Changed
- Approval notifications no longer mention (`cc @owner`) the PR owner when auto-merge is enabled on the PR, since the PR will be merged without further action from them.

- Mergeable status on approval is read through the GitHub API (`@actions/github`) instead of the `gh` CLI.

### Added
- Draft PRs no longer notify on `opened`; a "ready for review" card is sent on `ready_for_review`.
- Review requests for a team are announced; dismissed reviews are announced.
- `BRANCH_REGEX_FILTER` input (defaults to the previous hard-coded branch regex).
- `DEDUPLICATE` input (default `false`): best-effort skip of a notification already present in the task comments.
- Retry (3 attempts, backoff) when posting a task comment; the run now fails if a task could not be notified.
- Cache of GitHub-to-server user lookups within a run.
- Unit tests for the approval notification content.
- Dependabot: grouped minor/patch updates.
- CI: automatic GitHub release (tag `vMAJOR.MINOR` from `package.json`) when the version is bumped.

### Fixed
- Mentions in review comments: all mentions are detected (punctuation, new lines, multiple hyphens, one-letter handles), e-mails are ignored.
- A merged card is only sent on `closed`; other actions on an already merged PR (labels, pushes) no longer repeat it.
- Team review requests no longer abort on a missing reviewer.
- User-supplied values (names, branches, URLs) are HTML-escaped in cards.
- CI uses `npm ci` for reproducible builds; `package.json` version aligned with releases (1.33.0).

### Dependencies
- Bump prettier, brace-expansion, undici, eslint, jest and eslint-plugin-jest (Dependabot).
