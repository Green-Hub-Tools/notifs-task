# Contributing to notifs-task

Thanks for helping. Bug reports, documentation fixes and code are all welcome.

## Before you start

- **Found a bug or want a feature?** [Open an issue](https://github.com/Green-Hub-Tools/notifs-task/issues/new/choose) using the template.
- **Security problem?** Don't open an issue or PR; follow [SECURITY.md](SECURITY.md).
- **Larger change?** Open an issue first so we can agree on the approach before you invest time.

## Development setup

```sh
git clone https://github.com/Green-Hub-Tools/notifs-task && cd notifs-task
npm ci
npm run lint && npm test
npm run build   # bundles src/ into dist/ (CI commits dist/ on push, so don't commit it in a PR)
```

All checks must pass; CI runs them on every push and pull request.

## Making a change

1. Branch from the default branch; keep the change focused.
2. Add or update tests.
3. Update the README and the `action.yml` input descriptions if behaviour changes.
4. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`; `fix(security):` for security fixes), with the reason in the body.
5. Open a pull request and fill in the template. Maintainers sign release tags; signed commits are appreciated but not required.

## Principles

- **Secure by default.** Credentials come from action inputs/secrets and are never logged; anything taken from a PR (title, branch, body, user names) is validated or escaped before it reaches a request path or the posted HTML.
- **Few dependencies.** Prefer a small in-repo helper to a new package.
- **Tests for security behaviour.** A fix for auth, injection or resource limits comes with a regression test that fails without the fix.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## License

Contributions are accepted under the project's license (see [LICENSE](LICENSE)).
