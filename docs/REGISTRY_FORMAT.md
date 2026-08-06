# Static registry format

A ModeDOCK registry is a versioned JSON index pointing to immutable package descriptors.

```json
{
  "schemaVersion": 1,
  "name": "Example Community Registry",
  "packages": {
    "author.better-ui": {
      "2.1.0": {
        "descriptor": "./packages/author.better-ui/2.1.0/descriptor.json",
        "integrity": "<sha256-of-descriptor-file>"
      }
    }
  }
}
```

Locations may be relative paths, local absolute paths, `file://` URLs, or HTTP(S) URLs.

## Descriptor

A descriptor repeats the validated package manifest and lists every downloadable artifact:

```json
{
  "schemaVersion": 1,
  "manifest": {},
  "artifacts": [
    {
      "source": "BetterUI.dll",
      "size": 123456,
      "sha256": "<artifact-sha256>",
      "url": "./files/BetterUI.dll"
    }
  ],
  "integrity": "<canonical-manifest-and-artifact-metadata-sha256>"
}
```

The registry entry hash verifies the descriptor file bytes. Descriptor integrity verifies canonical manifest and artifact metadata. Each artifact has an independent size and SHA-256 check.

## Hosting

No application server is required. Valid hosting targets include:

- GitHub Pages;
- Cloudflare R2;
- Amazon S3;
- ordinary static web hosting;
- a local directory distributed with a launcher.

CORS must permit the launcher environment to read registry and artifact URLs when the integration runs inside a browser-like runtime.

## Publishing

```bash
moddock-core pack ./my-mod --out ./registry
moddock-core registry build ./registry
```

Re-running `pack` for the same package version overwrites its generated descriptor and payload. Published versions should be immutable. CI should reject republishing a version with different integrity.
