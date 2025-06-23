# Pull Request Notification for Tasks

![AGPL License](https://img.shields.io/badge/license-AGPL--3.0-green)

## Features

- Detects task references in PR titles
- Supports multiple PR events
- Handles PR reviews (approvals/change requests)
- Maps GitHub users to eXo users
- Rich formatted messages with PR links

## Installation

```yaml
name: PLF Pull Request Notifications
on:
  pull_request:
    types: [opened, reopened, closed, review_requested]
  pull_request_review:
    types: [submitted]

jobs:
  notify_tasks:
    runs-on: ubuntu-latest
    steps:
      - uses: Green-Hub-Tools/notifs-task@main
        with:
          SERVER_URL: 'https://community.exoplatform.com'
          SERVER_USERNAME: ${{ secrets.SERVER_USERNAME }}
          SERVER_PASSWORD: ${{ secrets.SERVER_PASSWORD }}
```
## Configuration

| Input | Required | Default |
|-------|----------|---------| 
| `SERVER_URL` | Yes | - |
| `SERVER_USERNAME` | Yes | - |
| `SERVER_PASSWORD` | Yes | - |
| `TASKS_REGEX_FILTER` | No | `(task\|maint\|exo)((-\|_)[0-9]{4,})+` |

## Development Setup

Clone repo
```bash
git clone https://github.com/Green-Hub-Tools/notifs-task.git
cd notifs-task
```
Install dependencies
```bash
npm install
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