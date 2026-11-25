# Development display branding

The upstream candidate and the fork share the display-name binding. The upstream candidate is based on v2.1.55 and keeps the CoS label. Its PR description draft is in `upstream-dev-suffix-pr.md`; the fork-specific presentation below is not part of that description.

## Shared display-name contract

- `src/shared/app-brand-name.ts:2` defines the base display label. `src/main/app-brand.ts:9,12` alone selects development mode and adds `(dev)`; renderer title and header consume that choice through AppState and t/ui bindings.
- Product name `Chat On Steroids` and app ID `com.chatonsteroids.app` stay unchanged so packaged installations retain their identity and user-data location. The development launch uses its explicit user-data path.
- The native macOS app menu keeps its existing identity: `Electron` from a checkout and `Chat On Steroids` in a packaged build.
- The one-line fork follow-up is `9dd2aa89`. Upstream `70589d99` introduces the display-name feature and the constant file; it is not a standalone inverse rename. The commit-pair symmetry check remains unresolved; see `venice-branch-scope.md`.

## Fork-specific presentation

- Main selects `Chat On Venice (dev)` for unpackaged runs and for packages explicitly launched with `COS_DEV_BRAND=1`; ordinary packages display `Chat On Venice`.
- The renderer receives that selection through AppState and uses the existing t/ui bindings. The three new display/About keys are registered directly in ja/en. Other languages keep their existing translations and use the English source for these new keys.
- Product name `Chat On Steroids`, app ID `com.chatonsteroids.app` and profile identity do not change.
- The ferro uses the existing icon generator. macOS tray images are black/alpha templates, with explicit 1x/2x representations. Native resources live in `build/` during development and `process.resourcesPath` after packaging.
- Diagnostics are off by default. `COS_TRAY_DIAGNOSTICS=1` enables one startup JSON line only for a dev-branded macOS run.

The existing twelve-locale checks still cover every pre-existing UI key. The additional ja/en-only exception is limited to the three newly introduced branding keys; runtime tests cover their English fallback across all thirteen UI languages.

```sh
npm run typecheck
npm run build
npm test -- test/dev-brand.test.ts test/dev-icon.test.ts test/tray-image.test.ts test/window-lifecycle.test.ts test/packaging.test.ts test/main-texts.test.ts test/renderer-i18n-source.test.ts test/renderer-i18n.test.ts
```

The SVG's `Chat On Venice` title is non-rendered metadata. `src/renderer/index.html` is a static source template with empty title/header bindings, not a generated file containing the development name. `APP_DISPLAY_NAME` does not generate either source file.
