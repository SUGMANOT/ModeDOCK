# Security policy

## Supported versions

Security fixes are applied to the latest `0.x` release until a stable support policy is published.

## Reporting

Use GitHub private vulnerability reporting. Include:

- ModeDOCK Core version;
- operating system and Node.js version;
- affected command or API call;
- a minimal package, registry, or Challenge Capsule fixture;
- expected and actual filesystem effects;
- whether target-root escape, unsafe overwrite/removal, integrity bypass, arbitrary code execution, or unsafe evidence collection is possible.

Do not publish a working filesystem escape or destructive proof of concept before a fix is available.

## Package security boundary

ModeDOCK Core protects its own package deployment workflow. It does not sandbox or audit game plugins. A DLL or other executable artifact can run with the game's user privileges after the game loads it.

The package engine provides:

- strict runtime validation;
- path traversal and nested-link checks;
- artifact and descriptor hashing;
- ownership tracking;
- stale-plan rejection;
- original-file backups;
- write-ahead journals and rollback;
- no package lifecycle scripts.

## Challenge Capsule security boundary

Challenge Capsules are declarative data. ModeDOCK does not execute capsule commands or launch game processes.

The challenge subsystem provides:

- runtime schema validation;
- game, loader, platform, and architecture compatibility checks;
- package preparation through the normal transaction engine;
- one active challenge per profile;
- managed-environment verification before arming;
- safe relative evidence paths;
- symbolic-link rejection;
- evidence byte and file-count limits;
- result output outside the game root;
- canonical SHA-256 integrity for capsule, ticket, and result data.

`handoff.consumerData` is inert. Integrating launchers must use a fixed allowlist and must never interpret arbitrary values as commands, executable paths, scripts, or arguments.

## Not provided

ModeDOCK does not currently provide:

- publisher or participant digital signatures;
- identity proof;
- anti-cheat guarantees;
- trusted timing;
- malware scanning;
- trust scoring;
- operating-system sandboxing;
- protection after a game or mod starts executing;
- process-memory, network, or input monitoring.

SHA-256 integrity detects content changes. It does not prove that a result came from a particular person or uncompromised computer.
