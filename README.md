# Pull Request Notification for Tasks

![AGPL License](https://img.shields.io/badge/license-AGPL--3.0-green)

## Features

- Detects task references in PR titles and comments on each referenced task
- Notifies on: PR opened, ready for review (drafts are skipped until then), reopened, closed, merged (including auto-merge), review requested (user or team)
- Handles reviews: approvals (with a "Ready to merge" badge), change requests, comments, `@mentions` and dismissed reviews
- Maps GitHub users to eXo users, falling back to the GitHub username
- Mentions (`cc @owner`) the PR owner on reviews, except on approvals when auto-merge is enabled
- Rich formatted messages with PR links; user-supplied values are HTML-escaped
- Retries failed task comments (3 attempts) and fails the run if a task could not be notified

## Installation

```yaml
name: PLF Pull Request Notifications
on:
  pull_request:
    types: [opened, reopened, closed, ready_for_review, review_requested]
  pull_request_review:
    types: [submitted, dismissed]

jobs:
  notify_tasks:
    runs-on: ubuntu-latest
    steps:
      - uses: Green-Hub-Tools/notifs-task@v1
        with:
          SERVER_URL: 'https://community.exoplatform.com'
          SERVER_USERNAME: ${{ secrets.SERVER_USERNAME }}
          SERVER_PASSWORD: ${{ secrets.SERVER_PASSWORD }}
```

Pin a release (e.g. `@v1.34`) for reproducible runs; see the [releases](https://github.com/Green-Hub-Tools/notifs-task/releases).

## Configuration

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `SERVER_URL` | Yes | - | Target server URL |
| `SERVER_USERNAME` | Yes | - | Server username used to post comments |
| `SERVER_PASSWORD` | Yes | - | Server user password |
| `SERVER_DEFAULT_SITENAME` | No | `dw` | Site used to build user profile links |
| `TASKS_REGEX_FILTER` | No | `(task\|maint\|exo)((-\|_)[0-9]{4,})+` | Regex matching task references in the PR title |
| `BRANCH_REGEX_FILTER` | No | `^(master\|develop(-exo\|-meed)?\|feature/[A-Za-z-]+[0-9]?\|stable/[0-9]+(\.[0-9]+)*\.x(-exo)?)$` | Regex of base branches that trigger notifications (case-insensitive) |
| `DEDUPLICATE` | No | `false` | Best effort: skip a notification already present in the task comments (useful on workflow re-runs) |
| `GITHUB_TOKEN` | No | repository token | Token used to read the PR mergeable status |

PRs created by `dependabot[bot]` or `snyk-bot` are ignored.

## Releases

Pushes to `v1` run lint, tests and the build; `dist/` is committed automatically. Bumping the `version` in `package.json` (`1.34.0` -> tag `v1.34`) creates a GitHub release. See [CHANGELOG.md](CHANGELOG.md).

## Development Setup

Clone repo
```bash
git clone https://github.com/Green-Hub-Tools/notifs-task.git
cd notifs-task
```
Install dependencies
```bash
npm ci
```
Run tests
```bash
npm test
```
Lint code
```bash
npm run lint
```
Build action
```bash
npm run build
```

## License
```plaintext
AGPL-3.0 License
Copyright (C) 2023 Green-Hub-Tools
Full license at LICENSE file
```