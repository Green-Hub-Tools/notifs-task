# Pull Request notification for tasks

This action is used to send notification to eXo Tasks during the Pull Request workflow (creation, approval, closing, merge)

# Example call of this action

```yaml
name: Pull Request notification for tasks

on:
  pull_request:
    types: [opened, reopened, closed, review_requested]
  pull_request_review:
    types: [submitted]

jobs:
  notif_tasks:
    runs-on: ubuntu-latest
    steps:
    - name: Send Notifications to Task
      uses: hbenali/notifs-task@main
      with:
        SERVER_URL: https://community.exoplatform.com
      secrets:
        SERVER_USERNAME: ${{ secrets.SERVER_USERNAME }}
        SERVER_PASSWORD: ${{ secrets.SERVER_PASSWORD }}
```