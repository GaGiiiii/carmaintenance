# ODRŽAVANJE AUTOMOBILA

A single-page web app for tracking car maintenance — vanilla JavaScript + Bootstrap 5, no build step. Same design system as `travelapp` (Inter font, Font Awesome, `shadow-box` cards, pill tabs, styled modals, four color themes). Data lives in the browser's `localStorage`, with optional real-time sync across devices via Firebase.

## What it tracks

Per car:

- **Trenutna kilometraža** — the car's current mileage, editable at any time. Everything else is evaluated against it.
- **Servisi** — service checklists (e.g. *Mali servis*, *Veliki servis*), each with an optional target-km range, a progress bar, and checkable to-do items.
- **Delovi i održavanje** — the maintenance log: each part records **last changed (km)** and the **next-due window (from–to km)**. From the current mileage the app derives a status:
  - **Isteklo** (overdue) — past the next-due window
  - **Na redu** (due) — inside the window
  - **Uskoro** (soon) — within 15.000 km of the window
  - **U redu** (ok) — nothing to do yet
  - **—** — no interval set
- **Problemi** / **Rešenja** — free-text lists of known issues and planned solutions.

The dashboard shows a live count of *Isteklo / Na redu / Uskoro* across all parts.

### "Obavljeno" — rolling the interval forward

Pressing **✓** on a part marks it replaced at the current mileage. If a previous interval is known (from `lastKm` → `nextFrom`/`nextTo`), the next-due window is shifted forward by the same distance, so the log stays current without re-typing the numbers.

## Mileage input

Km fields accept plain numbers (`162000`), `K` shorthand (`162K`, `161.5K`), and formatted values (`162.000`). Everything is stored internally as full kilometres.

## Data & storage

- One key in `localStorage` (`cars`) holds an array of cars; `activeCar` and `carSortMode` remember the UI state.
- Data model per car: `{ name, mileage, services: [{id, name, targetFrom, targetTo, items:[{name, done}]}], parts: [{id, name, lastKm, nextFrom, nextTo, note}], problems: [string], solutions: [string] }`.
- On first open the app is seeded with the example car from the original notes so nothing starts empty.
- **Backup / restore** via the buttons at the bottom: export all cars to `.json`, or import a `.json` (replaces all cars, behind a confirmation).

## Multi-device sync (optional)

Sync is **off** until Firebase is configured — the app works fully offline until then. To enable it:

1. Create a free Firebase project at <https://console.firebase.google.com> and register a **Web** app.
2. Paste the generated `firebaseConfig` into the marked block at the top of `js/firebase-sync.js`.
3. Create a **Cloud Firestore** database and add security rules restricting access to your sync-code documents (never leave it in open/test mode).
4. Open the app → **cloud** button → *Napravi kod* on one device, then enter that code on another to pair them. Edits then sync both ways in real time (last write wins).

**Security note:** the Firebase web `apiKey` is public by design — access is controlled by your Firestore rules. Anyone who knows a sync code can read/write that code's data, so treat codes like passwords.

## Running locally

It's a static file — open `index.html` directly, or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

- [Bootstrap 5](https://getbootstrap.com/) — layout & modals
- [Font Awesome](https://fontawesome.com/) — icons
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — optional device sync
