# Contributing

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Add tests for every filesystem or resolver behavior change.
4. Run `npm run verify` before opening a pull request.

## Non-negotiable rules

- Never weaken target-root containment or nested-link rejection.
- Never execute package lifecycle scripts.
- Never silently overwrite externally modified managed files.
- Every mutating operation must remain journaled and recoverable.
- Package and registry schemas require explicit versioning for breaking changes.
- Tests must use temporary directories, never real game installations.
