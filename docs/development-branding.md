# Development display branding

This change can be applied directly to upstream v2.1.55. It does not require the Venice gateway, extension adapter or English-fallback implementation.

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

The shared display-name constant is `src/shared/app-brand-name.ts`. Upstream keeps the CoS label; one fork follow-up changes only that constant back to Venice.
