# Git workflow

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Stable releases only, protected, tagged (`v0.1.0`, `v0.2.0`, ...) |
| `develop` | Integration branch, default target for pull requests |
| `feature/<scope>-<name>` | New functionality, e.g. `feature/admin-routing` |
| `fix/<scope>-<name>` | Bug fixes, e.g. `fix/admin-navbar-overflow` |
| `docs/<name>` | Documentation only |

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`

- Types: `feat`, `fix`, `style`, `refactor`, `docs`, `test`, `chore`, `ci`
- Scopes: `repo`, `infra`, `admin`, `ui`, `mobile`, `backend`, `ai`
- Imperative mood, English, up to 72 characters
- One logical change per commit; the project must build after every commit

Examples:

```
feat(ui): add Button component with variants
fix(backend): handle empty image upload
docs(admin): add setup instructions
```

## Pull requests

1. Branch from `develop`.
2. Keep the PR focused on one feature.
3. Describe what changed and attach screenshots for UI work.
4. At least one teammate reviews before merge.
5. Merge with a merge commit to keep the step-by-step history.

## Releases

`develop` is merged into `main` through a pull request, then tagged:

```bash
git tag -a v0.1.0 -m "Admin web: initial version"
git push origin v0.1.0
```
