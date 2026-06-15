# 06 · Fix the mobile header overlap

**Request:** "In the mobile app, fix the 'Paranalyzer' overlap — the Paranalyzer
text and Filter / Columns overlap on mobile. You can remove the text on mobile."

**Depends on:** nothing.
**Effort:** small.

## Problem

On narrow screens the list header crams the brand title against the action
buttons, and they visually overlap.

## Why

The header is a single `space-between` flex row:

- `.app-title` is `flex: 1; white-space: nowrap`
  ([`shell.css:60`](../../packages/app/src/shell.css#L60)) — it refuses to wrap
  or shrink its text.
- `.header-actions` is `flex-shrink: 0`
  ([`shell.css:69`](../../packages/app/src/shell.css#L69)) and holds **four**
  controls: Filter, Columns, Import, ⚙️
  ([`FlightsListScreen.tsx:87`](../../packages/app/src/screens/FlightsListScreen.tsx#L87)).
- `shell.css` is shared by web and mobile and has **no media queries**, so the
  same wide-screen layout is forced onto a ~360 px phone.

There's an old "Task F" comment promising the title "must never clip"
([`shell.css:59`](../../packages/app/src/shell.css#L59)) — that constraint is
exactly what causes the squeeze; the nowrap title wins the space fight and the
actions overrun it.

## Design

Hide the brand **text** (keep the 🪂 mark) on narrow screens, and let the actions
take the freed space. Scope it to the *brand* title only so the Settings and
Detail headers — which reuse `.app-title` for "Settings" / the filename
([`SettingsScreen.tsx:130`](../../packages/app/src/screens/SettingsScreen.tsx#L130),
[`FlightDetailScreen.tsx:188`](../../packages/app/src/screens/FlightDetailScreen.tsx#L188))
— are untouched.

### 1. Split the brand into mark + text

In `FlightsListScreen`
([`:86`](../../packages/app/src/screens/FlightsListScreen.tsx#L86) and the
loading state at [`:76`](../../packages/app/src/screens/FlightsListScreen.tsx#L76)):

```tsx
<span className="app-title app-brand">
  <span className="app-brand-mark" aria-hidden="true">🪂</span>
  <span className="app-brand-text">Paranalyzer</span>
</span>
```

### 2. Media query in `shell.css`

```css
@media (max-width: 560px) {
  .app-brand { flex: 0 0 auto; }      /* stop the title hogging the row    */
  .app-brand-text { display: none; }   /* keep the 🪂, drop the wordmark     */
  .header-actions { gap: 4px; }        /* tighten the action cluster        */
}
```

Pick the breakpoint against the real action width; ~520–560 px is where four
buttons + a wordmark stop fitting. The app keeps a visible 🪂 so the header
doesn't look empty, and `aria-hidden` on the mark plus the (now hidden but still
in-DOM) text keeps the accessible name intact — or add `aria-label="Paranalyzer"`
to `.app-brand` if the text is fully removed.

## Optional, if it's still tight

Four buttons can still crowd a very small phone even without the wordmark:

- Shrink to icon-only actions on narrow screens (Filter → funnel glyph, Columns →
  columns glyph), keeping `aria-label`s.
- Or collapse Columns + ⚙️ into a single "⋯" overflow menu.

These are larger; do them only if the wordmark removal isn't enough. The request
explicitly green-lights just dropping the text, so start there.

## Test

- `npm run typecheck`.
- Use `preview_resize` (or devtools responsive mode) at 360 px and 400 px:
  confirm no overlap, the 🪂 stays, and Filter/Columns/Import/⚙️ are all tappable.
- Confirm Settings ("Settings") and Detail (filename) headers still show their
  text at the same widths.
