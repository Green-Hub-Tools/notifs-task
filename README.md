# Pull Request notification for tasks

This action is used to send notification to eXo Tasks during the Pull Request workflow (creation, approval, closing, merge)

# Example call of this action

```yaml
name: PLF Pull Request Notifications

on:
  pull_request:
    types: [opened, reopened, closed, review_requested]
  pull_request_review:
    types: [submitted]

jobs:
  notify_tasks:
    name: Check for tasks identifiers
    runs-on: ubuntu-latest
    steps:
      - name: PLF Tasks Webhook
        uses: Green-Hub-Tools/notifs-task@main
        with:
          SERVER_URL: 'https://community.exoplatform.com'
          SERVER_DEFAULT_SITENAME: 'dw'
          SERVER_USERNAME: ${{ secrets.SERVER_USERNAME }}
          SERVER_PASSWORD: ${{ secrets.SERVER_PASSWORD }}
          TASKS_REGEX_FILTER: '(task|maint|exo)((-|_)[0-9]{4,})+' 
```