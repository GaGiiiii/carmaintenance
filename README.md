# ODRŽAVANJE AUTOMOBILA

A simple car-maintenance tracker web app. Vanilla JavaScript + Bootstrap 5, no build step — a static site hosted on GitHub Pages, with data stored in the browser and optional real-time sync across devices via Firebase. Same design system as [travelapp](https://github.com/GaGiiiii/travelapp): Inter font, Font Awesome, `shadow-box` cards, pill tabs, styled modals, and four color themes.

## Features

- **Multiple cars** — separate cars with tabs to switch, plus create / rename / delete. Each car tracks its own mileage, services, parts, problems, and solutions.
- **Current mileage** — set each car's current kilometres; everything else is evaluated against it. Km fields accept plain numbers (`162000`), `K` shorthand (`162K`, `161.5K`), and formatted values (`162.000`).
- **Servisi** — service groups (e.g. *Mali servis*, *Veliki servis*) with an optional target-km range and a simple bullet list of items. Add / rename / delete services and items.
- **Delovi i održavanje** — the maintenance log. Each part records **last changed (km)** and its **next-due window (from–to km)**; from the current mileage the app derives a status:
  - **Isteklo** (overdue) — past the next-due window
  - **Na redu** (due) — inside the window
  - **Uskoro** (soon) — within 15.000 km of the window
  - **U redu** (ok) — nothing to do yet
  - **—** — no interval set
- **Obavljeno** — mark a part replaced at the current mileage; if a previous interval is known, the next-due window rolls forward by the same distance, so the log stays current without re-typing.
- **Dashboard** — a live count of *Isteklo / Na redu / Uskoro* across all parts.
- **Sorting** — order the parts list by status (worst first), next-due, A-Z, or last changed.
- **Problemi / Rešenja** — free-text lists of known issues and planned solutions per car.
- **Everything via styled modals** — add/edit forms, delete confirmations, and alerts all use the app's own modals (no native browser dialogs).
- **Backup / restore** — export all cars to a `.json` file, or import one (replaces all cars, behind a confirmation).
- **Themes** — cycle through several color themes (Nord, One Dark, Light, Sepia).
- **Multi-device sync** — optional, via Firebase Firestore using a simple *sync code* (see below).

## Data & storage

- Cars persist in the browser's `localStorage`, so the app works fully offline.
- Data model: an array of cars, each `{ name, mileage, services: [{ id, name, targetFrom, targetTo, items: [{ name }] }], parts: [{ id, name, lastKm, nextFrom, nextTo, note }], problems: [string], solutions: [string] }`. Mileage and all km fields are stored as full kilometres (integers) or `null`.
- On first load the app is seeded with the example car from the original notes, so nothing starts empty.

## Multi-device sync (optional)

Sync uses a **sync-code** model (no accounts) via Firebase Firestore. This app shares the [travelapp](https://github.com/GaGiiiii/travelapp) Firebase project but writes to its own **`carsyncs`** collection, so car data and travel lists never collide.

1. If you fork this for a different project, paste your own `firebaseConfig` into the marked block at the top of `js/firebase-sync.js`.
2. In the Firebase console, create a **Cloud Firestore** database and add security rules that restrict reads/writes to your sync-code documents. This app's rule (added alongside the existing `syncs` / `receiptcatalogs` rules):

   ```
   match /carsyncs/{code} {
     allow read: if code.matches('[A-Z2-9]{8}');
     allow write: if code.matches('[A-Z2-9]{8}')
                  && request.resource.data.cars is list
                  && request.resource.data.size() < 100;
   }
   ```

   Never leave the database in test/open mode.
3. Open the app, click the **cloud** button → **Napravi kod** on one device, then enter that code on another to pair them. Edits then sync both ways in real time.

> The device that *creates* the code seeds the shared data; a device that *joins* has its local cars replaced by the shared set. After pairing, sync is bidirectional (last write wins).

**Security note:** the Firebase web `apiKey` is public by design — it identifies the project, not authenticates it. Access is controlled by the Firestore rules above. Anyone who knows a sync code can read/write that code's data, so treat codes like passwords.

## Hosting

Served via **GitHub Pages** from the `main` branch. On the free GitHub plan, Pages requires the repository to be **public**.

## Running locally

It's a static file — open `index.html` directly in a browser, or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

- [Bootstrap 5](https://getbootstrap.com/) — layout & modals
- [Font Awesome](https://fontawesome.com/) — icons
- [Firebase Firestore](https://firebase.google.com/docs/firestore) — optional device sync
