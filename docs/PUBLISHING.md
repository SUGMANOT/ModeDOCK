# Publishing checklist

ModeDOCK's public release name is `1.0.0b`. npm requires valid SemVer, so `package.json` uses `1.0.0-beta.0`. The matching Git tag is `v1.0.0b`.

## Blocking owner decisions

- [ ] Choose a license deliberately. The repository currently declares `UNLICENSED`; do not describe it as open source until this changes.
- [ ] Create the GitHub repository, then add the real `author`, `repository`, `homepage`, and `bugs` metadata to `package.json`. Do not commit placeholder URLs.
- [ ] Decide whether an npm release is intended. Confirm package ownership with `npm view moddock` immediately before publishing.

## Release verification

- [ ] Use Windows, Node.js 20+, npm, and the .NET 10 SDK.
- [ ] Run `npm ci` from the committed lockfile.
- [ ] Run `npm run verify:release`.
- [ ] Confirm `node dist/moddock.js --version` prints `1.0.0b`.
- [ ] Run `npm pack --json --ignore-scripts` and inspect every included file.
- [ ] Confirm the package has no runtime dependencies and is below 1 MiB unpacked.
- [ ] Confirm no secrets, local profiles, logs, backups, downloads, screenshots, or unrelated test packages are tracked.
- [ ] Push and wait for the Windows CI workflow to pass.

## GitHub release

- [ ] Commit the exact verified tree.
- [ ] Create annotated tag `v1.0.0b` on that commit.
- [ ] Use `docs/RELEASE_1.0.0b.md` as the release-note base.
- [ ] Attach the exact npm tarball if distributing it through GitHub Releases.
- [ ] Publish a SHA-256 checksum for every attached binary/archive.
- [ ] Mark the GitHub release as a pre-release.

## Optional npm release

- [ ] Sign in with `npm login` and confirm 2FA/provenance settings.
- [ ] Publish the already-tested tarball with the beta tag, not `latest`:

```powershell
npm publish .\moddock-1.0.0-beta.0.tgz --access public --tag beta
```

- [ ] Verify installation from a clean prefix with `npm install -g moddock@beta`.

Never rebuild between verification and publication: publish the exact artifact that passed the checks.
