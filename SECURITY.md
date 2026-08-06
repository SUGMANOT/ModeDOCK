# Security policy

## Supported versions

Security fixes are applied to the latest `0.x` release until a stable support policy is published.

## Reporting

Use GitHub private vulnerability reporting. Include:

- ModeDOCK Core version;
- operating system and Node.js version;
- affected command or API call;
- a minimal package/registry fixture;
- expected and actual filesystem effects;
- whether target-root escape, unsafe overwrite/removal, integrity bypass, or arbitrary code execution is possible.

Do not publish a working filesystem escape or destructive proof of concept before a fix is available.

## Security boundary

ModeDOCK Core protects its own package deployment workflow. It does not sandbox or audit game plugins. A DLL or other executable artifact can run with the game's user privileges after the game loads it.

The core provides:

- strict runtime validation;
- path traversal and nested-link checks;
- artifact and descriptor hashing;
- ownership tracking;
- stale-plan rejection;
- original-file backups;
- write-ahead journals and rollback;
- no package lifecycle scripts.

It does not currently provide:

- publisher signatures;
- malware scanning;
- trust scoring;
- operating-system sandboxing;
- protection after a game or mod starts executing.
