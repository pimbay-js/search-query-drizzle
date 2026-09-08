# Security Policy

## Reporting a vulnerability

Report suspected security vulnerabilities privately — do not open a public issue for them.

Use [GitHub Security Advisories](https://github.com/pimbay-js/search-query-drizzle/security/advisories/new) for this repository, or email **security@pimbay.dev**.

Include what you'd include in any bug report: affected version/commit, reproduction steps, and impact as you understand it.
A proof-of-concept is helpful but not required to file a report.

## What to expect

- Acknowledgement within 5 business days.
- An initial assessment (confirmed / not applicable / needs more information) within 10 business days of acknowledgement.
- Credit in the fix's changelog entry, unless you ask to stay anonymous.

There is no bug bounty program.

## Scope

In scope: this repository's own code (`src`) and its Actions workflows.
The `escapeLikeValue`/search-terms-to-SQL condition builder is the most security-relevant surface here — a LIKE-pattern escaping bug is a plausible source of unintended matches or query errors, though not SQL injection (Drizzle's parameterized queries handle that).

Out of scope: vulnerabilities in `drizzle-orm` itself, or in devDependencies with no `search-query-drizzle`-specific exploitation path — report those upstream instead.
If you're unsure whether something is in scope, report it anyway and let us triage it.

## Supported versions

Only the latest published version receives security fixes.
This project does not currently maintain long-term-support branches.
