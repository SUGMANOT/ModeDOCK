# Security policy

## Supported version

ModeDOCK `1.0.0b` is the current public beta. Security fixes are applied to the latest beta only.

## Reporting a vulnerability

Use the repository's private **Security -> Report a vulnerability** flow. Do not disclose a working exploit, private game files, credentials, personal paths, or sensitive logs in a public issue.

Include the ModeDOCK version, operating system, affected command, machine-readable error code, minimal reproduction, and expected impact. Reports involving path traversal, unsafe overwrite/removal, archive extraction, command execution, signature or hash verification, privilege boundaries, or untrusted plugin execution are security-relevant.

ModeDOCK does not claim to sandbox third-party mods. A mod or plugin may execute with the user's privileges when launched by its game or compatible runtime. Only install content you trust.
