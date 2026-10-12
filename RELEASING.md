# Releasing

Releases are published to npm by `.github/workflows/publish.yml` using
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC).
There is no npm token stored in GitHub.

## Regular release

```bash
git switch main && git pull
npm version patch        # or minor / major / prerelease --preid=beta
git push --follow-tags
```

`npm version` bumps `package.json`, commits and creates the `vX.Y.Z` tag.
Pushing the tag starts the workflow, which:

1. checks that the tag matches `package.json`,
2. installs, typechecks and tests,
3. publishes to npm with provenance (pre-releases go to the `next` dist-tag),
4. creates a GitHub release with generated notes.

Update `CHANGELOG.md` before running `npm version`.

## One-time setup

See the setup section in the project notes; in short:

1. Publish the first version manually (`npm publish`) so the package exists.
2. npm → package → Settings → Trusted publishing → GitHub Actions:
   organization `lean-ssg`, repository `lean-ssg`, workflow `publish.yml`,
   environment `npm`, allow `npm publish`.
3. Within 2 days, release a new version through CI to validate the connection.
4. npm → package → Settings → Publishing access →
   "Require two-factor authentication and disallow tokens".
