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

## npm

The repository currently uses the package name `@modedock/core`. Publishing that exact name requires control of the `modedock` npm scope. Change `name`, repository URLs, and documentation imports before publication if you use another scope.

Verify the exact artifact:

```bash
npm install
npm run verify
npm pack
```

Test it in an isolated prefix:

```bash
npm install -g ./modedock-core-0.1.0.tgz --prefix ./npm-test
./npm-test/bin/moddock-core --version
```

Publish a pre-1.0 release:

```bash
npm login
npm publish --access public
```

Do not rebuild between the final verification and publication. Publish the exact tarball that passed installation testing when using a release automation pipeline.

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
