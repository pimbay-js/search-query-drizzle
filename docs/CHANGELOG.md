# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `containsPattern()`, `startsWithPattern()` and `endsWithPattern()` — escape a value and put the `%` around it, for a `LIKE` written by hand; pair each with `likeEscapeClause()`.
- `buildSearchTermsCondition` honours every marker in `SearchTermsConfig.likeMarkers`, including multi-character ones and a marker that prefixes another.

### Changed

- **BC break:** requires `@pimbay/search-query: ^2.1`.
- **BC break:** the `LIKE` escape character is `~`, not `\`. `ESCAPE '\'` is a syntax error on MySQL/MariaDB, and the `ESCAPE '\\'` that fixes them is rejected by PostgreSQL and SQLite.
- **BC break:** `escapeLikeValue()` and `likeEscapeClause()` lost their `escapeChar` argument; `DEFAULT_LIKE_ESCAPE_CHAR` is no longer exported.
- **BC break:** negated terms now also match rows whose column is `NULL`. `createSearchTermsConfig({ ignoredTermsMatchNull: false })` restores the stricter reading.

### Fixed

- Every `LIKE`/`NOT LIKE` emitted `ESCAPE '\'`, which MySQL and MariaDB reject with a syntax error.
- A wildcard marker that `escapeLikeValue()` also escapes (`%`, `_`, `~`) became an escaped literal instead of a wildcard. Markers are substituted before escaping now.

## [1.0.0] - 2026-09-08

### Added

- Initial extraction from `asset-dedup-registry` into a standalone package.
- `DrizzleSimpleAdapter`/`DrizzleIdentityAdapter` over `@pimbay/search-query`'s adapter interfaces.
- `DrizzleFetchJoinSafeAdapter` — `PageAdapter`/`CountableAdapter` for pagination over a to-many join, via an explicit distinct-root-id page query followed by a per-id row fetch.
- `buildSearchTermsCondition`/`buildSearchTermsConditionFromString`.
- `escapeLikeValue`, `likeEscapeClause`.
