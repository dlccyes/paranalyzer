# 05 · Progress / loading indicator for Drive import & export

**Request:** "Add a progress bar / loading animation for Google Drive
import/export because it may take a while."

**Depends on:** nothing.
**Effort:** small (Phase 1) → medium (Phase 2).

## Goal

While backing up to or restoring from Drive, show that something is happening —
ideally with stages and, where measurable, real progress — instead of a button
that just goes disabled.

## Current state

- Settings wraps every Drive action in `run()`, which only flips a boolean
  `busy` and disables buttons
  ([`SettingsScreen.tsx:73`](../../packages/app/src/screens/SettingsScreen.tsx#L73),
  buttons at [`:329`](../../packages/app/src/screens/SettingsScreen.tsx#L329)).
- The work itself is opaque:
  - `backupNow` = OAuth token → `createBackupJson` (reads **every** track from
    IndexedDB, [`backup.ts:18`](../../packages/app/src/data/backup.ts#L18)) →
    `findBackupFile` → one multipart `fetch` upload
    ([`web/.../drive.ts:173`](../../apps/web/src/platform/drive.ts#L173),
    [`drive-rest.ts:21`](../../packages/app/src/data/drive-rest.ts#L21)).
  - `restore` = token → download → `importBackup` (writes **every** track,
    [`backup.ts:46`](../../packages/app/src/data/backup.ts#L46)).
- `ImportButton` similarly shows only "Importing…" text
  ([`ImportButton.tsx:86`](../../packages/app/src/components/ImportButton.tsx#L86)).
- Precedent to copy: `recalcAll(onProgress)` already threads a
  `(done, total)` callback and Settings renders `"Recalculating… {n}/{m}"`
  ([`recalc.ts:15`](../../packages/app/src/data/recalc.ts#L15),
  [`SettingsScreen.tsx:45`](../../packages/app/src/screens/SettingsScreen.tsx#L45)).

## Design

Two phases. Phase 1 alone satisfies the request; Phase 2 is the "real percentage"
upgrade.

### Phase 1 — staged indeterminate progress (ship this)

Thread a progress callback through the Drive adapter, modelled on `recalcAll`.

1. **Extend `DriveAdapter`** ([`platform.ts:13`](../../packages/app/src/platform.ts#L13)):

   ```ts
   export type DriveProgress =
     | { stage: "authorizing" | "preparing" | "uploading" | "downloading" }
     | { stage: "importing"; done: number; total: number };

   backupNow(onProgress?: (p: DriveProgress) => void): Promise<void>;
   restore(mode, onProgress?: (p: DriveProgress) => void): Promise<{ imported; skipped }>;
   ```

   This ripples to **both** adapters: web
   ([`apps/web/src/platform/drive.ts`](../../apps/web/src/platform/drive.ts)) and
   mobile ([`apps/mobile/src/platform/drive.ts`](../../apps/mobile/src/platform/drive.ts)).
   Each emits the stages it can: `authorizing` before `getToken`, `preparing`
   before `createBackupJson`, `uploading`/`downloading` around the transfer.

2. **`createBackupJson` / `importBackup`** gain an optional
   `onProgress(done, total)` and call it in their per-flight loops
   ([`backup.ts:18`](../../packages/app/src/data/backup.ts#L18),
   [`backup.ts:60`](../../packages/app/src/data/backup.ts#L60)) — exactly like
   `recalcAll`. The adapter forwards these as `{ stage: "importing", done, total }`.

3. **UI** — a small presentational `ProgressOverlay` (or inline bar) in
   `packages/ui` with an indeterminate animation + a stage label, plus a
   determinate fill when `total` is known. Settings drives it from new state
   (`const [progress, setProgress] = useState<DriveProgress | null>(null)`),
   replacing the bare `busy` boolean for Drive actions. Map stages to copy:
   "Authorizing…", "Preparing backup…", "Uploading…", "Downloading…",
   "Importing {done}/{total}…".

4. Apply the same overlay to local `Export backup` / `Import backup`
   ([`SettingsScreen.tsx:301`](../../packages/app/src/screens/SettingsScreen.tsx#L301))
   and optionally to `ImportButton` for consistency — cheap once the component
   exists.

### Phase 2 — real byte progress (optional follow-up)

`fetch` exposes neither upload progress nor easy streamed download. To get a true
percentage:

- **Upload:** swap `uploadToDrive`'s `fetch`
  ([`drive-rest.ts:21`](../../packages/app/src/data/drive-rest.ts#L21)) for
  `XMLHttpRequest` and read `xhr.upload.onprogress` (`loaded/total`). Keep the
  same multipart body/headers. Note: this lives in `drive-rest.ts` (shared) and
  in the web adapter's inline copy
  ([`web/.../drive.ts:132`](../../apps/web/src/platform/drive.ts#L132)) — dedupe
  to one helper while here.
- **Download:** read `response.body.getReader()` and tally bytes against
  `Content-Length` for `restore`'s GET
  ([`web/.../drive.ts:187`](../../apps/web/src/platform/drive.ts#L187)).
- Feed those into the same `DriveProgress` channel (add an optional
  `loaded/total` to the upload/download stages).

Mobile uses a Capacitor HTTP/native path — byte progress may not be available
there; fall back to Phase 1's staged indeterminate bar.

## Edge cases

- **OAuth popup** (`getToken` with `prompt: "consent"`,
  [`web/.../drive.ts:90`](../../apps/web/src/platform/drive.ts#L90)) can block for
  a long time and has no measurable progress → keep `authorizing` indeterminate.
- **Errors mid-flight** → clear `progress`, fall back to the existing `toast`
  error path in `run()`
  ([`SettingsScreen.tsx:76`](../../packages/app/src/screens/SettingsScreen.tsx#L76)).
- **Auto-backup** (`maybeAutoBackup`,
  [`web/.../drive.ts:195`](../../apps/web/src/platform/drive.ts#L195)) runs
  silently in the background — pass **no** `onProgress` so it stays invisible.
- Don't let the overlay trap the user — disable the triggering buttons (already
  done via `busy`) but allow the rest of the app.

## Test

- `npm run typecheck`.
- Manual (web): connect Drive, back up with several flights → stage labels
  advance and the importing counter ticks; restore shows download → importing.
- Throttle the network in devtools to confirm the indicator is actually visible
  during a slow transfer.

## Recommendation

Do **Phase 1 only** first — it directly answers the request ("a while" → show
stages + a counter) with no transport rewrite. Schedule Phase 2 separately if a
true upload percentage is wanted.
