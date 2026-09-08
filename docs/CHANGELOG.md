# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-08

### Added

- Initial extraction from `asset-dedup-registry` into a standalone package.
- `DrizzleSimpleAdapter`/`DrizzleIdentityAdapter` over `@pimbay/search-query`'s adapter interfaces.
- `DrizzleFetchJoinSafeAdapter` — `PageAdapter`/`CountableAdapter` for pagination over a to-many join, via an explicit distinct-root-id page query followed by a per-id row fetch.
- `buildSearchTermsCondition`/`buildSearchTermsConditionFromString`.
- `escapeLikeValue`, `likeEscapeClause`.
