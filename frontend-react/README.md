# TFS Logistics — React Build

A real React 19 rewrite of the operator scan app — hooks, component
composition, the actual React reconciler — not a cosmetic relabeling.

## Why this looks the way it does

**No JSX, no build step.** React 19 removed its CDN/UMD builds (see
[react.dev's 2024 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#umd-builds-removed)) —
the current recommended way to run React with zero build tooling is ES
modules via an import map, which is what `index.html` does, pointing
at [esm.sh](https://esm.sh). Without a bundler available in this
environment, JSX has nowhere to compile to, so every component is
written with `React.createElement` directly (aliased to `h` for
readability). This is genuine, idiomatic-for-its-constraints React —
hooks, `useState`, `useEffect`, component props, conditional rendering
— just without JSX sugar on top.

**Why not Vite/Next.js/create-react-app instead?** Those all need
`npm install` against the public registry, which this environment
cannot reach. `react` and `react-dom` happen to already be installed
locally (used for Claude's own tooling) — real npm packages, real
React 19.2.5 — so this build uses those for verification and ships the
CDN-ESM approach for the browser.

## What's verified, and how

| Layer | Verified? | How |
|---|---|---|
| Component rendering logic | **Yes** | `npm run verify` — 9 tests using the real, locally-installed `react-dom/server` to actually render every component (`Login`, `Picker`, `TP1Panel`, `TP2Panel`) with different props and assert on the output. Not a mock — the genuine React reconciler. |
| Import map correctness | **Yes** | Every bare import (`react`, `react-dom/client`) in `app.js`/`components.js` cross-checked programmatically against `index.html`'s import map — no typos, no missing entries. |
| Syntax validity | **Yes** | `node --check` on every file. |
| Live browser rendering, clicking, state updates | **No** | This needs real internet access to fetch React from esm.sh, which this sandbox's network rules block — the identical, already-documented limitation as this project's barcode-camera scanning (ZXing) and dashboard map (Leaflet) dependencies. It will load exactly like those do: nothing here in this environment, normally once deployed anywhere with outbound internet access. |

**Run the verification yourself:**
```bash
npm run verify
```

## What's ported vs. not

Only **TP1** and **TP2** are fully implemented as React components,
matching the exact same scope decision made for the original backend
starter (see `backend/README.md`) — a complete, tested worked example
rather than 17 shallow, unverified conversions. Every other touch
point, WSW step, and non-linear flow shows a clear "not yet ported"
placeholder in the picker instead of silently doing nothing.

**To port the rest:** each one already has a fully working, tested
reference implementation in `frontend/mercury-scanner.html` (the
vanilla build) and a corresponding backend endpoint (`backend/README.md`'s
API table). `TP2Panel` in `components.js` is the best template to copy
— it demonstrates the full pattern: fetching open manifests on mount,
a picker-if-multiple / auto-select-if-one flow, a scan buffer via
`useState`, and a submit handler that calls the API and reports
success via the `onDone` callback. `app.js`'s `if (activeTP === 'tp2')`
block shows how to wire a newly-ported panel into the router.

## Relationship to the other two frontend builds

This project now ships **three** frontend variants, each with a
different, explicit purpose — see the top-level `README.md` for the
full picture:

1. `frontend/mercury-scanner.html` — vanilla JS, **fully working, all
   17 actions**, the one to actually operate the business with today.
2. `frontend/reference-integration.html` — minimal proof that the API
   contract works at all.
3. `frontend-react/` (this folder) — the React rewrite, TP1/TP2
   complete, the rest following a documented, provable pattern.
