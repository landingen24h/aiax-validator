# Contributing to aiax-validator

Thanks for helping. This repository is small on purpose: one module, its tests and CI.

## Setup

1. Use Node 20 or newer (see `engines` in package.json) or Python 3.11+ where a Python package is present.
2. Install with the lockfile: `npm ci` (or `pip install -r requirements.txt`).
3. Run the tests: `npm test` (or `pytest`). CI runs the same commands on every push and pull request.

## Pull requests

- Keep each change focused and add or update a test for it.
- Make sure CI is green before asking for review.
- Note user-visible changes under Unreleased in CHANGELOG.md.
- Never commit keys, tokens or private data. Report security issues as described in SECURITY.md.

## Licence

By contributing you agree that your contribution is licensed under the MIT licence of this repository.
