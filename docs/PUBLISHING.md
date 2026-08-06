# Publishing

## GitHub

Create an empty repository, then from the extracted project directory:

```bash
git init
git add .
git commit -m "feat: initial ModeDOCK Core release"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

Enable GitHub private vulnerability reporting and branch protection for `main` after the first push.

## GitHub Releases and Packages

The public package name is `@sugmanot/modedock-core`. Its npm scope matches the GitHub repository owner, as required by GitHub Packages.

After a successful `CI` run for a push to `main`, `.github/workflows/release.yml`:

1. verifies the exact commit again;
2. builds the npm tarball;
3. publishes the version to GitHub Packages when it is not already present;
4. creates the matching `v<version>` tag;
5. creates a GitHub Release with the tarball and `SHA256SUMS.txt`.

Published package versions and Git tags are immutable. Increase `version` in `package.json` and add the matching section to `CHANGELOG.md` before the next release.

To install from GitHub Packages, authenticate npm with a GitHub token that has `read:packages`:

```bash
npm config set @sugmanot:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN
npm install @sugmanot/modedock-core
```

To test the exact release artifact locally:

```bash
npm install
npm run verify
npm pack
npm install -g ./sugmanot-modedock-core-0.1.0.tgz --prefix ./npm-test
./npm-test/bin/moddock-core --version
```

## Static example registry

The generated example under `examples/sample-registry` can be used to verify static hosting. After hosting it, replace the profile registry location with the public `registry.json` URL.

## Release checklist

- [ ] `npm run verify`
- [ ] global installation from `npm pack` succeeds
- [ ] CLI end-to-end example succeeds
- [ ] package and registry schemas match implementation
- [ ] `CHANGELOG.md` is updated
- [ ] published package versions are immutable
- [ ] registry descriptors and artifacts are served without transformation
