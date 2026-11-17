# flightsim-core

This repository owns the headless flight systems extracted from Flight3d.

- Use the Node version in `.node-version` and npm with the checked-in lockfile.
- Preserve browser independence: no DOM, renderer, device polling, storage, UI,
  audio or i18n imports. Three.js is a math-only peer dependency.
- Keep world axes, units, input signs, fixed-step timing and stateful sequences
  compatible. Inject terrain/wind/runway/navigation instead of importing scenery.
- Treat `package.json` exports as the public API. Test packed distribution, not
  only imports from the source checkout.
- For each change, create a focused branch/worktree from current origin/main.
  Preserve unrelated changes and open a pull request after validation.
- Run `npm run check`, `npm test`, and `npm run test:package` before release.
- Changes used by Flight3d require its compatibility/integration tests as well;
  this repository's Node tests do not prove rendered browser behavior.
- Bump the version and release tag for published changes; never move a release
  tag. Update consumers' pinned commit and lockfile explicitly.
