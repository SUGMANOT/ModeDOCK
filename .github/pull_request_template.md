## Summary

Describe the behavior changed and why.

## Verification

- [ ] `npm run verify`
- [ ] `npm run test:install` when packaging or CLI entry points changed
- [ ] New or changed filesystem behavior has a temporary-directory test
- [ ] Documentation and `CHANGELOG.md` are updated

## Safety

- [ ] Target-root containment, backups, integrity checks, dry-run, and rollback remain enforced
- [ ] No arbitrary process injection, anti-cheat/DRM bypass, privilege escalation, or silent destructive operation was added
