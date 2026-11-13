# AGENTS.md — SetPoint Project Context & Developer Guide

## 1. Project Overview
**SetPoint** is an offline-capable Progressive Web App (PWA) built for volleyball coaches and assistant coaches on game day. It combines:
- **Live Rally-Point & Side-Out Tracking**: Automatic clockwise rotation for both teams when winning a side-out, set/match win detection (`Best of 5` with 15-pt tie-break in Set 5, `Best of 3` with 15-pt tie-break in Set 3, or `Open`), timeouts (`0/2` per set), and full-state multi-step Undo.
- **Interactive Court & Tactical Board**: Live 6-position court (`base` mode) and SVG tactical board (`receive` and `transition` phases) supporting `5-1` (both `S–OH–MB` and `S–MB–OH` orders), `6-2`, and `4-2` systems with real-time FIVB positional fault validation (`validateFormation.ts`) and automatic back-row Libero replacement.
- **Live Bench Intelligence**: Real-time Side-out %, Break %, Attack Efficiency, Reception rating (`0–3`) distribution, rotation +/- and Side-out matrix (`R1–R6`), opponent scoring-run/weak-rotation alerts, and 1-tap tactical notes.
- **Hybrid Storage & Post-Match Review**: Works 100% standalone offline via browser `localStorage` (`volleyball_local_archive_v1`) and optionally syncs to a Go + InfluxDB backend (`/api/volleyball/matches`) with an offline retry outbox (`volleyball_outbox_v1`) plus WhatsApp/Signal text summaries, UTF-8 BOM Excel CSV exports, and JSON backup/import.

---

## 2. Tech Stack & Conventions
- **Framework**: **Svelte 5** (`^5.57.0`) using **Runes** (`$state`, `$derived`, `$derived.by`, `$props`, `$bindable`, `$effect`).
  - *Important*: Always use Svelte 5 rune syntax and event attributes (`onclick={...}`, `onkeydown={...}`, `onchange={...}`) — never legacy Svelte 3/4 `export let`, `$:`, or `on:click`.
- **Language**: **TypeScript** (`~6.0.2`) with strict mode (`"strict": true`, `"verbatimModuleSyntax": true`, `"moduleResolution": "bundler"`).
  - Always use `import type { ... }` for type-only imports to satisfy `verbatimModuleSyntax`.
- **Bundler**: **Vite 8** (`^8.3.0`), configured with `base: '/volleyball/'` in `vite.config.ts`.
  - Static assets in `index.html`, `public/manifest.webmanifest`, and `public/sw.js` must use relative paths (`./favicon.svg`, `./manifest.webmanifest`, `./sw.js`) so deployments under `/volleyball/` resolve properly.
- **UI Language**: **Unified German (`de-DE`)** across all screens, labels, and alerts, keeping standard volleyball loanwords used in German gyms (`Side-out`, `Break`, `Kill`, `Block`, `Dig`, `Ass`, `Libero`, `R1–R6`).
- **Styling**: Component-scoped CSS with a high-contrast dark slate shell (`#0f172a`) and light card surfaces (`#ffffff` / `#f8fafc`), touch-optimized (`touch-action: manipulation`, large tap targets for courtside tablets/phones), and responsive 2-column layout at `>= 900px` (`landscape` tablets & laptops).

---

## 3. Essential Commands
Run all commands from the repository root (`/home/manfred/Documents/setPoint`):

| Task | Command | Notes |
| :--- | :--- | :--- |
| **Start Dev Server** | `npm run dev` | Runs Vite dev server with HMR |
| **Type & Svelte Check** | `npm run check` | Runs `svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json` |
| **Unit Tests** | `npm test` | Runs Node's native test runner via `node --import ./tests/register-ts.mjs --test tests/*.test.ts` |
| **Production Build** | `npm run build` | Builds static bundle into `dist/` |
| **Preview Build** | `npm run preview` | Serves production build locally |

> **Agent Rule**: Before finishing any code change, always run `npm run check`, `npm test`, and `npm run build` and ensure 0 errors and 0 warnings.

---

## 4. Architecture & File Map

```text
setPoint/
├── .github/workflows/
│   └── deploy.yml                  # CI/CD: builds dist/ and atomically deploys via SSH to /opt/atmos/volleyball/dist
├── public/
│   ├── favicon.svg                 # App icon (SVG)
│   ├── manifest.webmanifest        # PWA Web App Manifest (standalone, relative paths for /volleyball/)
│   └── sw.js                       # Offline Service Worker (app-shell cache, network-only for /api/*)
├── src/
│   ├── main.ts                     # App entrypoint + production Service Worker registration
│   ├── app.css                     # Global typography, reset, and root variables
│   ├── App.svelte                  # Root state machine ('setup' | 'tracker' | 'history' | 'legal') & live match orchestration
│   └── lib/
│       ├── types.ts                # All TypeScript interfaces & domain types
│       ├── matchEngine.ts          # Pure volleyball rules: set/match win, side-out rotation, FIVB sub rules, lineup validation
│       ├── analytics.ts            # Shared live & archive KPI computation (SO%, Break%, Atk Eff, Pass 0-3, R1-R6, runs)
│       ├── formations.ts           # Static 5-1 & dynamic 5-1/6-2/4-2 receive/transition coordinates + custom drag storage
│       ├── validateFormation.ts    # Pure FIVB positional fault validator (front/back & left/right overlap checks)
│       ├── api.ts                  # REST client (/api/volleyball/*), offline outbox, local archive, team presets, storage keys
│       ├── export.ts               # WhatsApp summary formatter, UTF-8 BOM CSV generator, JSON import/export parser
│       ├── id.ts                   # Unique event/match ID generator & HH:MM:SS timestamp formatter
│       ├── SetupForm.svelte        # Pre-match configuration, saved team presets, lineup tools, system templates
│       ├── Court.svelte            # Interactive 2-team court (base grid + embedded ReceiveFormation + opponent rotation/notes)
│       ├── ReceiveFormation.svelte # Interactive SVG tactical board (Annahme / Angriff, drag & drop, overlap fault lines)
│       ├── LiveCoachPanel.svelte   # Collapsible live coaching cockpit (SO%, Break%, alerts, R1-R6 grid, quick notes)
│       ├── BetweenSetModal.svelte  # Modal between sets (serve, R1-R6 start rotation, restore starting 6, flip court)
│       ├── MatchHistory.svelte     # Saved matches browser (remote InfluxDB + local device archive + exports + JSON import)
│       └── LegalPage.svelte        # Privacy Policy, Terms, Cookie/LocalStorage inspector & 1-click storage reset, Impressum
└── tests/
    ├── register-ts.mjs             # Node ESM resolve hook mapping extensionless './foo' imports to './foo.ts'
    ├── matchEngine.test.ts         # Unit tests for rules, rotations, substitutions, and set/match winners
    ├── analytics.test.ts           # Unit tests for Side-out %, Break %, reception averages, and rotation stats
    ├── formations.test.ts          # Unit tests verifying 0 FIVB overlap faults across 5-1, 6-2, and 4-2 rotations
    └── export.test.ts              # Unit tests for WhatsApp summary, CSV escaping/ordering, and JSON import validation
```

---

## 5. Core Volleyball Domain Rules & Invariants

When modifying court, rotation, or scoring logic, preserve these invariants:

1. **Court Positions & Rotation Numbering**:
   - Standard FIVB court zones:
     - **Front row (am Netz, left to right)**: `Pos 4` (Left), `Pos 3` (Middle), `Pos 2` (Right)
     - **Back row (Hinterfeld, left to right)**: `Pos 5` (Left), `Pos 6` (Middle), `Pos 1` (Right / Server)
   - **Clockwise Rotation (`rotateClockwise`)**: When a team wins a rally while receiving (`Side-out`), players shift clockwise (`Pos 2 -> Pos 1`, `Pos 1 -> Pos 6`, etc.), and the rotation counter (`Läufer`) decrements: `1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1`.
   - **Lineup Array Mapping**: Given a 6-element `courtPlayers` array (`index 0..5`, representing initial `Pos 1..6` in `R1`) and rotation `rot (1..6)`:
     - Array index at court position `pos`: `getIndexForCourtPos(pos, rot) = (pos - rot + 6) % 6`
     - Court position for array index `idx`: `getCurrentPosForIndex(idx, rot) = ((idx + rot - 1) % 6) + 1`

2. **FIVB Positional Overlap Rules (`validateFormation.ts`)**:
   - On the tactical SVG board (`x: 0..100` left-to-right, `y: 0..100` net-to-baseline):
     - Front-row players must be closer to the net (smaller `y`) than their corresponding back-row player: `y(4) < y(5)`, `y(3) < y(6)`, `y(2) < y(1)`.
     - Left-to-right order must hold within each row: `x(4) < x(3) < x(2)` and `x(5) < x(6) < x(1)`.
   - Only enforced during the `'receive'` phase (at service hit). In `'transition'` (`Angriff`), players move freely to their target attack/defense zones.

3. **Libero Auto-Swap & Serving**:
   - When `liberoAutoSwap` is enabled and a Libero (`isLibero: true`) is registered on the bench, the active Libero automatically replaces any Middle Blocker (`MB1` / `MB2`) in back-row positions (`Pos 1, 5, 6`), except on `Pos 1` during our own serve (`servingTeam === 'us'`) when `liberoCanServe === false`.

4. **Event Ordering (`events`)**:
   - In live state (`App.svelte`), `events` is stored **newest-first** (`events = [newEvent, ...events]`) so the live feed renders the latest action at the top and `events[0]` is always the target for `undoLastEvent()`.
   - Always pass event arrays through `toChronologicalEvents(events)` in `analytics.ts` or `export.ts` before computing sequential stats (such as scoring runs, Side-out inference, or CSV exports).

5. **Full-State Undo (`MatchUndoSnapshot`)**:
   - Every point, quick action, timeout, substitution, Libero switch, and tactical note attaches `undoSnapshot: createUndoSnapshot()` to the logged `VolleyballEvent`.
   - Before uploading to the backend or saving to `localStorage` archives (`sanitizePayloadForStorage` in `api.ts`), `scoreSnapshot` and `undoSnapshot` are stripped to keep payloads compact.

---

## 6. LocalStorage Keys & Backend API Contract

All browser storage keys are centralized in `src/lib/api.ts`:
- `setpoint_active_match` (`ACTIVE_MATCH_STORAGE_KEY`): Live match crash-recovery snapshot.
- `volleyball_local_archive_v1` (`LOCAL_ARCHIVE_STORAGE_KEY`): Standalone local match archive (up to 50 full matches).
- `volleyball_outbox_v1` (`OUTBOX_STORAGE_KEY`): Offline upload queue for the Go backend.
- `volleyball_team_presets_v1` (`TEAM_PRESETS_STORAGE_KEY`): Saved team rosters (`Start-6`, `Bank/Libero`, system).
- `volleyball_custom_formations_v1` (`CUSTOM_FORMATIONS_STORAGE_KEY`): Custom dragged receive/transition coordinates per system & rotation.
- `volleyball_api_key_v1` (`API_KEY_STORAGE_KEY`): Optional `X-API-Key` PIN for protected server endpoints.

### Optional Go + InfluxDB Backend Endpoints
- `POST /api/volleyball/matches`: Uploads a completed `VolleyballMatchPayload`. Returns `{ matchId, syncedEvents }` (`200/201`) or `401` if `X-API-Key` is missing/invalid.
- `GET /api/volleyball/matches`: Returns `SavedMatchSummary[]` (or `{ matches: SavedMatchSummary[] }`).
- `GET /api/volleyball/matches/:id`: Returns a full `VolleyballMatchPayload` for post-match review.
