# Security policy

## Supported versions

Only the latest release receives security fixes. Please upgrade before reporting an issue you found in an older version.

| Version | Supported |
| --- | --- |
| Latest release ([GitHub releases](https://github.com/Green-Hub-Tools/notifs-task/releases/latest)) | yes |
| Anything older | no |

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.** Report it privately through GitHub: **[Report a vulnerability](https://github.com/Green-Hub-Tools/notifs-task/security/advisories/new)** (private vulnerability reporting).

Include what you can of:

- the affected version and how it is run (workflow triggers and inputs, with secrets removed);
- what an attacker can do and what they need (network access, valid credentials, ...);
- steps or a proof of concept to reproduce it.

## What to expect

- an acknowledgement within **3 working days**;
- an assessment and, if it is a vulnerability, a fix plan within **10 working days**;
- a fix released as soon as it is ready and verified, with the release notes describing the problem and how to mitigate it, crediting you if you wish;
- coordinated disclosure: please keep details private until a fixed release is available.

This is a volunteer-maintained project; there is no bug bounty.

## Scope

In scope: notifs-task itself and its release artifacts (`dist/`). Typical findings: injection into the posted task comments (HTML), request forgery or path manipulation towards the Tasks server, leaking of the server credentials or the GitHub token in logs, unsafe handling of PR-controlled input (title, branch, body).

Out of scope: issues that require an already-compromised host; missing hardening with no concrete impact; vulnerabilities in third-party dependencies with no demonstrated impact on notifs-task (report those upstream; Dependabot and Trivy track them here).

## How security is checked here

CodeQL (code scanning, including the GitHub Actions workflows), OpenSSF Scorecard and Dependabot run on every push and on a schedule; results are in the repository's Security tab. 

## Past security fixes

Fixed vulnerabilities are described in the [release notes](https://github.com/Green-Hub-Tools/notifs-task/releases).
