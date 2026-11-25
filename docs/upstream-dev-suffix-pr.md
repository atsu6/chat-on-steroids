# Distinguish development builds with a `(dev)` suffix

- Show `Chat On Steroids (dev)` in development window titles and in-app display names; ordinary packaged builds retain `Chat On Steroids`.
- Keep `productName` and `appId` unchanged so packaged installations retain their existing application identity and user-data location.
- Keep the native macOS app-menu name unchanged: `Electron` when launched from a checkout and `Chat On Steroids` in packaged builds.

Validation (906666f2): typecheck and build passed; targeted tests: 178 passed, 0 failed.
