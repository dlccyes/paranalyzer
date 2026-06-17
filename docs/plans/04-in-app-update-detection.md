# 04 — In-app update detection (feasibility)

## Question

Can the app tell the user "a newer version is available" — on **web** and on the
**sideloaded Android** build — and offer to update?

## Current distribution

- **Web:** GitHub Pages (`paranalyzer.approximator.net`),
  [`gh-deploy.yml`](../../.github/workflows/gh-deploy.yml). Vite hashed assets;
  **no service worker**. A hard reload already gets the latest, but there's no
  signal telling the user to reload.
- **Android:** sideloaded debug APK on the rolling release tag `android-latest`,
  built by [`android.yml`](../../.github/workflows/android.yml). `versionCode`
  comes from the CI `BUILD_NUMBER` (`github.run_number`); `versionName` is the
  static string `"1.0"`. The web Settings screen already links to the APK via
  `getPlatform().apkUrl`. **No Play Store**, so Play's in-app-update API is not
  available.

## Verdict: feasible, two small mechanisms

Both reduce to: *expose the installed version, expose the latest version, compare,
show a banner.* The hard part (auto-install) we explicitly defer.

### Web

1. **Bake a build id** into the bundle: Vite `define: { __APP_VERSION__:
   JSON.stringify(gitSha) }` (or the CI run number).
2. **Publish a tiny `version.json`** at the site root each deploy (write it in
   `gh-deploy.yml`), e.g. `{ "version": "<sha>", "builtAt": <ts> }`.
3. App **polls `version.json`** (on focus / every N minutes, cache-busted). If it
   differs from `__APP_VERSION__`, show a non-blocking "New version available —
   Reload" toast that calls `location.reload()`.

- Lightweight, no service worker, no offline behavior change.
- **Alternative:** adopt `vite-plugin-pwa` and use `registerSW({ onNeedRefresh
  })` for a standards-based update prompt **and** offline support. Bigger change
  (SW lifecycle, caching strategy, testing) — only if we also want offline.

### Android (sideload)

1. Read the **installed** version with `@capacitor/app` `App.getInfo()` →
   `{ version, build }` (`build` maps to `versionCode` = the CI run number).
2. Read the **latest available** build from a manifest we publish alongside the
   APK — either:
   - a small `latest.json` asset added to the `android-latest` release in
     `android.yml` (`{ "build": <run_number>, "url": "<apk url>" }`), or
   - the GitHub Releases API for tag `android-latest` (no asset needed, but rate
     limits / network).
   Prefer the published `latest.json` asset.
3. Compare `installed.build < latest.build` → show an update banner with a
   **Download** action that opens `apkUrl` (the existing flow). Android's
   package installer takes over from the downloaded file.

- **Detect + notify + deep-link to download: straightforward.**
- **Silent/auto-install is the hard part** and is **out of scope for v1**: it
  needs the `REQUEST_INSTALL_PACKAGES` permission plus a custom
  download-then-`PackageInstaller`/`ACTION_VIEW` intent (no existing Capacitor
  plugin fits — `@capawesome/capacitor-app-update` is **Play-Store only** and
  won't work for GitHub-hosted APKs). v1 = notify + open the download.

## Shared surface

Add to `PlatformAdapter`
([`platform.ts`](../../packages/app/src/platform.ts)) a small capability so the
UI is platform-agnostic:

```ts
checkForUpdate?(): Promise<{ current: string; latest: string; updateUrl?: string } | null>;
```

- Web adapter implements it via `version.json`.
- Mobile adapter implements it via `App.getInfo()` + `latest.json`.
- A shared `UpdateBanner` consumes the result; "Reload" on web, "Download" on
  Android.

## Versioning gap to fix first

`versionName "1.0"` is static and useless for comparison. Decide a single
**compare key**:

- Simplest: the integer `versionCode`/`build` (CI run number) we already set —
  monotonic, zero extra work. Use that for Android.
- For web, the git SHA (opaque-equality, not ordered) is enough since "different
  ⇒ newer" for a single-branch deploy.

## CI changes

- `android.yml`: after building, also upload `latest.json` (`{ build, url }`) to
  the `android-latest` release.
- `gh-deploy.yml`: emit `version.json` into `apps/web/dist` before deploy and
  pass the build id into the Vite `define`.

## Spike / decision gates

- Confirm `App.getInfo().build` returns the CI `versionCode` on a real install.
- Confirm GitHub release assets are fetchable from the WebView without auth
  (public repo — should be fine; verify CORS for the `latest.json` fetch, or
  bundle the compare via the release API).
- Decide web path: lightweight `version.json` poll (recommended) vs. full PWA.

## Not in scope (v1)

Background/auto download, silent install, delta updates, staged rollouts.
