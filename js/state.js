// Application state: the car data model, persistence, and the sync bridge.
// A "car" is:
//   { name, mileage, services: [ {id, name, targetFrom, targetTo, items:[{name, done}]} ],
//     parts: [ {id, name, lastKm, nextFrom, nextTo, note} ],
//     problems: [string], solutions: [string] }
// mileage / lastKm / nextFrom / nextTo are stored as full kilometres (integers) or null.
// This file owns `cars`, `activeCarName`, and `sortMode`; the UI layer (app.js) reads them.

let __idSeq = Date.now();
function uid() { return 'id' + (__idSeq++).toString(36); }

const SORT_MODES = ['status', 'next', 'az', 'last'];

// The example car from the user's notes — so the app is populated on first open.
function seedCars() {
    return [{
        name: 'Moj auto',
        mileage: 162000,
        services: [
            {
                id: uid(), name: 'Mali servis', targetFrom: 161000, targetTo: 162000, checklist: true, items: [
                    { name: 'Nemiran rad u leru', done: false },
                    { name: 'PPF folije na farove', done: false }
                ]
            },
            {
                id: uid(), name: 'Veliki servis', targetFrom: 160000, targetTo: null, checklist: false, items: [
                    { name: 'Bobine', done: false },
                    { name: 'Svećice?', done: false },
                    { name: 'Ulje u kočnicama', done: false }
                ]
            }
        ],
        parts: [
            { id: uid(), name: 'Svećice', lastKm: 133000, nextFrom: 160000, nextTo: 190000, note: '' },
            { id: uid(), name: 'Kočnice (full)', lastKm: 143000, nextFrom: 170000, nextTo: 190000, note: 'Prednje (P) 170K–190K · Zadnje (D) 200K–260K' },
            { id: uid(), name: 'Antifriz', lastKm: 145000, nextFrom: 185000, nextTo: 230000, note: '' },
            { id: uid(), name: 'Menjač servis', lastKm: 154000, nextFrom: 194000, nextTo: 204000, note: '' },
            { id: uid(), name: 'Ulje u kočnicama', lastKm: null, nextFrom: 150000, nextTo: 160000, note: 'Na 2 godine (150K–160K)' },
            { id: uid(), name: 'Ulje zadnje osovine (zadnji diferencijal)', lastKm: 70000, nextFrom: null, nextTo: null, note: '' },
            { id: uid(), name: 'Ulje u zadnjem diferencijalu', lastKm: 153000, nextFrom: 190000, nextTo: 230000, note: '' },
            { id: uid(), name: 'Set razvoda motora sa varijatorima', lastKm: 115000, nextFrom: 175000, nextTo: 235000, note: 'Na 5 godina' },
            { id: uid(), name: 'Set pomoćnog kaiša', lastKm: 115000, nextFrom: 175000, nextTo: 235000, note: 'Isto kao set razvoda' },
            { id: uid(), name: 'Amortizeri', lastKm: null, nextFrom: 80000, nextTo: 150000, note: '' },
            { id: uid(), name: 'Pumpa za vodu', lastKm: null, nextFrom: null, nextTo: null, note: 'Isto kad i veliki servis (VS)' }
        ],
        problems: ['Pogonska vratila parnih brzina', 'Uljna pumpa'],
        solutions: ['Jakovo menjač', 'Raspitati se za remont menjača — gde raditi i koliko košta; da li se više isplati staviti nov?']
    }];
}

function toKm(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeCar(c) {
    return {
        name: typeof c.name === 'string' && c.name.trim() ? c.name : 'Auto',
        mileage: toKm(c.mileage) ?? 0,
        services: Array.isArray(c.services) ? c.services.map(s => ({
            id: s.id || uid(),
            name: typeof s.name === 'string' ? s.name : 'Servis',
            targetFrom: toKm(s.targetFrom),
            targetTo: toKm(s.targetTo),
            checklist: s.checklist !== false, // default true; plain reference list when false
            items: Array.isArray(s.items) ? s.items.map(it => ({
                name: typeof it === 'string' ? it : (it.name || ''),
                done: !!(it && it.done)
            })).filter(it => it.name) : []
        })) : [],
        parts: Array.isArray(c.parts) ? c.parts.map(p => ({
            id: p.id || uid(),
            name: typeof p.name === 'string' ? p.name : '',
            lastKm: toKm(p.lastKm),
            nextFrom: toKm(p.nextFrom),
            nextTo: toKm(p.nextTo),
            note: typeof p.note === 'string' ? p.note : ''
        })).filter(p => p.name) : [],
        problems: Array.isArray(c.problems) ? c.problems.filter(x => typeof x === 'string' && x.trim()) : [],
        solutions: Array.isArray(c.solutions) ? c.solutions.filter(x => typeof x === 'string' && x.trim()) : []
    };
}

let cars;
const storedCars = localStorage.getItem('cars');
if (storedCars) {
    try { cars = JSON.parse(storedCars).map(normalizeCar); }
    catch (e) { cars = seedCars(); }
} else {
    cars = seedCars();
}
if (!Array.isArray(cars) || cars.length === 0) cars = seedCars();

let activeCarName = localStorage.getItem('activeCar');
if (!cars.some(c => c.name === activeCarName)) activeCarName = cars[0].name;

let sortMode = localStorage.getItem('carSortMode') || 'status';
if (!SORT_MODES.includes(sortMode)) sortMode = 'status';

function getActiveCar() {
    return cars.find(c => c.name === activeCarName) || cars[0];
}

function persistLocal() {
    localStorage.setItem('cars', JSON.stringify(cars));
    localStorage.setItem('activeCar', activeCarName);
    localStorage.setItem('carSortMode', sortMode);
}

// Save locally and (if paired) push to the cloud.
function saveCars() {
    persistLocal();
    window.__cloud && window.__cloud.push(cars);
}

// --- Bridge for the Firebase sync module (js/firebase-sync.js) ---
window.__getLocalCars = () => cars;

// Called when a remote change arrives; updates local state WITHOUT pushing back.
window.__applyRemoteCars = (remoteCars) => {
    if (!Array.isArray(remoteCars)) return;
    cars = remoteCars.map(normalizeCar);
    if (cars.length === 0) cars = seedCars();
    if (!cars.some(c => c.name === activeCarName)) activeCarName = cars[0].name;
    persistLocal();
    renderAll();
};

// ---- Status logic: where a part stands relative to current mileage ----
const SOON_KM = 15000; // "Uskoro" window before the next-due starts

function partStatus(p, mileage) {
    const { nextFrom, nextTo } = p;
    if (nextFrom == null && nextTo == null) return 'none';
    if (mileage == null) return 'none';
    if (nextTo != null && mileage > nextTo) return 'overdue';
    if (nextFrom != null && mileage >= nextFrom) return 'due';
    if (nextFrom != null) return (mileage >= nextFrom - SOON_KM) ? 'soon' : 'ok';
    // only nextTo known
    return (mileage >= nextTo - SOON_KM) ? 'soon' : 'ok';
}

const STATUS_META = {
    overdue: { label: 'Isteklo', cls: 'status-overdue', rank: 0 },
    due:     { label: 'Na redu', cls: 'status-due', rank: 1 },
    soon:    { label: 'Uskoro', cls: 'status-soon', rank: 2 },
    ok:      { label: 'U redu', cls: 'status-ok', rank: 3 },
    none:    { label: '—', cls: 'status-none', rank: 4 }
};

function getSortedParts() {
    const car = getActiveCar();
    const arr = car.parts.slice();
    const mi = car.mileage;
    if (sortMode === 'az') {
        arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'next') {
        arr.sort((a, b) => (a.nextFrom ?? Infinity) - (b.nextFrom ?? Infinity));
    } else if (sortMode === 'last') {
        arr.sort((a, b) => (b.lastKm ?? -Infinity) - (a.lastKm ?? -Infinity));
    } else { // status: worst first, then soonest next-due
        arr.sort((a, b) => {
            const ra = STATUS_META[partStatus(a, mi)].rank;
            const rb = STATUS_META[partStatus(b, mi)].rank;
            if (ra !== rb) return ra - rb;
            return (a.nextFrom ?? Infinity) - (b.nextFrom ?? Infinity);
        });
    }
    return arr;
}
