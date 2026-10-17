# Releasing notifs-task

Consumers use the action through the `v1` branch (`Green-Hub-Tools/notifs-task@v1`), so every push to `v1` is live.
A *release* is a `vMAJOR.MINOR` marker with notes. Releases are **immutable** once published, so the workflow only
creates a **draft**; you write the notes and publish it.

1. Make sure `v1` is green and there are no open security alerts.

    ```sh
    git checkout v1 && git pull --rebase origin v1
    npm ci && npm run lint && npm test
    gh api repos/Green-Hub-Tools/notifs-task/dependabot/alerts -q '[.[]|select(.state=="open")]|length'
    gh api 'repos/Green-Hub-Tools/notifs-task/code-scanning/alerts?state=open' -q length
    ```

1. Bump `version` in `package.json` (`npm version X.Y.0 --no-git-tag-version`), add the entry to `CHANGELOG.md`,
   commit (`chore: release X.Y.0`) and push to `v1`.

1. CI lints, tests, builds, commits `dist/` (`chore: automated build [skip ci]`) and, when the tag `vX.Y` does not
   exist yet, creates a **draft** release `vX.Y` targeting that final commit.

1. Write the notes (security fixes first) and publish. The tag is created by GitHub at publish time, on the commit
   that contains the built `dist/`.

    ```sh
    gh release edit vX.Y --title vX.Y --notes-file notes.md --draft=false
    ```

1. Verify the release (`gh release view vX.Y`), that CI, CodeQL and Scorecard are green, and that no alert is open.

Never delete and recreate a published tag. Fix forward with the next version.
