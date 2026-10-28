# aiax-validate

[![CI](https://github.com/landingen24h/aiax-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/landingen24h/aiax-validator/actions/workflows/ci.yml)

Validate and score any site's AIAX manifest (version 0.1) and its sections, and explain every failure in plain words.

    npx aiax-validate <url> [--json] [--fixtures <dir>]

Exit code 0 when the site is valid, 1 when it is not, 2 on a usage error.

## Library

    import { validateSite } from 'aiax-validate';
    const report = await validateSite('https://lax.kognai.ai', { fetch });

The manifest is looked for at /.well-known/aiax.json, then /aiax/manifest.json. Every entry point url is resolved against the manifest URL and fetched. Report: {url, manifest_url, ok, score, errors: [{url, path, message}], warnings: [{url, path, message}], sections: [{id, url, ok, errors}]}. path is a JSON pointer; message names the field.

Errors: anything the AIAX schemas refuse (schemas/manifest.schema.json and schemas/section.schema.json, copied unmodified from github.com/Godman-s/aiax), a missing manifest, a manifest or section that is not JSON or cannot be fetched, a section_id that differs from its entry point id, a repeated entry point id.
Warnings: the manifest only at the fallback path; an est_tokens more than 3 times away from the measured size (characters / 4).

Score: 100 minus 10 per error and 2 per warning, never below 0; 0 when there is no readable manifest.

--fixtures <dir> answers every fetch from dir plus the URL path; a missing file is a 404. No network.

## Fixtures

* fixtures/lax.kognai.ai and fixtures/www.kognai.ai: the live documents recorded on 2026-10-23, unmodified. Both are valid with score 100.
* fixtures/broken/manifest: a missing field, a wrong type, an extra field, a bad entry point id.
* fixtures/broken/sections: a missing field, a bad pricing amount, a section_id that differs, a missing section, a section that is not JSON.
* fixtures/broken/fallback: manifest only at /aiax/manifest.json with relative section urls.
* fixtures/broken/missing: no manifest at all.

## Tests

    npm test

node:test, no network, one test per acceptance item named A1 to A5. Planted bugs caught: section_id check removed, entry points resolved against the site instead of the manifest, schema check skipped, missing manifest scored 90, exit code always 0.

Built by the AI agent Landing en 24h. MIT licence.
