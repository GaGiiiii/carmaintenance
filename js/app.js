// UI layer: DOM wiring, rendering, and all user actions.
// Depends on js/state.js (cars, activeCarName, sortMode, getActiveCar, getSortedParts,
// saveCars, partStatus, STATUS_META, ...).

// ----- Modal instances -----
const formModal = new bootstrap.Modal(document.getElementById('formModal'));
const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const syncModal = new bootstrap.Modal(document.getElementById('syncModal'));
const driveModal = new bootstrap.Modal(document.getElementById('driveModal'));

// ----- DOM refs -----
const carTabs = document.getElementById('car-tabs');
const mileageValue = document.getElementById('mileage-value');
const statusSummary = document.getElementById('status-summary');
const servicesList = document.getElementById('services-list');
const partsList = document.getElementById('parts-list');
const problemsList = document.getElementById('problems-list');
const solutionsList = document.getElementById('solutions-list');
const sortSelect = document.getElementById('sort-select');
const localStorageInfo = document.getElementById('localstorage-info');

sortSelect.value = sortMode;
sortSelect.onchange = () => { sortMode = sortSelect.value; saveCars(); renderParts(); };

// ----- Number helpers -----
function parseKm(input) {
    if (input == null) return null;
    let s = String(input).trim().toLowerCase();
    if (s === '') return null;
    s = s.replace(/km/g, '').replace(/\s/g, '');
    let mult = 1;
    if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1).replace(',', '.'); }
    else { s = s.replace(/[.,]/g, ''); }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * mult);
}

function formatFull(km) {
    if (km == null) return '—';
    return km.toLocaleString('de-DE') + ' km';
}

// Compact "K" notation matching the user's notes (162K, 161.5K).
function formatK(km) {
    if (km == null) return '—';
    const v = km / 1000;
    const r = Math.round(v * 10) / 10;
    return (Number.isInteger(r) ? r : r.toFixed(1)) + 'K';
}

function rangeText(from, to) {
    if (from == null && to == null) return '—';
    if (from != null && to != null) return `${formatK(from)} – ${formatK(to)}`;
    if (from != null) return `od ${formatK(from)}`;
    return `do ${formatK(to)}`;
}

// ----- Generic form modal -----
// fields: [{ key, label, value, type: 'text'|'km'|'textarea', placeholder }]
// onSave(values) -> error string (shown inline) or null on success.
let formCallback = null;
function openForm(title, fields, onSave) {
    document.getElementById('form-title').textContent = title;
    const wrap = document.getElementById('form-fields');
    wrap.innerHTML = '';
    fields.forEach(f => {
        const group = document.createElement('div');
        group.className = 'mb-3';
        const label = document.createElement('label');
        label.className = 'form-label-sm d-block';
        label.textContent = f.label;
        let input;
        if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'form-control';
            input.rows = 2;
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            if (f.type === 'km') input.inputMode = 'numeric';
        }
        input.id = 'field-' + f.key;
        input.value = f.value == null ? '' : f.value;
        if (f.placeholder) input.placeholder = f.placeholder;
        input.dataset.type = f.type || 'text';
        group.append(label, input);
        wrap.appendChild(group);
    });
    document.getElementById('form-error').classList.add('d-none');
    formCallback = { fields, onSave };
    formModal.show();
    setTimeout(() => { const el = document.getElementById('field-' + fields[0].key); if (el) { el.focus(); el.select && el.select(); } }, 300);
}

function submitForm() {
    if (!formCallback) return;
    const values = {};
    formCallback.fields.forEach(f => {
        const el = document.getElementById('field-' + f.key);
        const raw = el.value.trim();
        values[f.key] = f.type === 'km' ? parseKm(raw) : raw;
    });
    const err = formCallback.onSave(values);
    const errBox = document.getElementById('form-error');
    if (err) { errBox.textContent = err; errBox.classList.remove('d-none'); return; }
    formModal.hide();
}

// ----- Confirm / alert -----
let confirmCallback = null;
function openConfirm(message, onConfirm, okLabel = 'Obriši') {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').textContent = okLabel;
    confirmCallback = onConfirm;
    confirmModal.show();
}
function submitConfirm() {
    const cb = confirmCallback; confirmCallback = null;
    confirmModal.hide();
    if (cb) cb();
}
function openAlert(message) {
    document.getElementById('alert-message').textContent = message;
    alertModal.show();
}

// ----- Small DOM helper -----
function iconBtn(iconClass, title, onClick, extraClass) {
    const b = document.createElement('button');
    b.className = 'row-action ' + (extraClass || '');
    b.title = title;
    b.innerHTML = `<i class="fas ${iconClass}"></i>`;
    b.onclick = (e) => { e.stopPropagation(); onClick(e); };
    return b;
}

// ===================== RENDERING =====================
function renderAll() {
    renderTabs();
    renderDashboard();
    renderServices();
    renderParts();
    renderNotes();
    updateLocalStorageInfo();
}

function renderTabs() {
    carTabs.innerHTML = '';
    cars.forEach(car => {
        const btn = document.createElement('button');
        btn.className = 'list-tab' + (car.name === activeCarName ? ' active' : '');
        btn.textContent = car.name;
        btn.onclick = () => { activeCarName = car.name; saveCars(); renderAll(); };
        carTabs.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'list-add-btn';
    addBtn.title = 'Novi auto';
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.onclick = openNewCarModal;
    carTabs.appendChild(addBtn);
}

function renderDashboard() {
    const car = getActiveCar();
    mileageValue.textContent = formatFull(car.mileage);

    // Summary counts by status.
    const counts = { overdue: 0, due: 0, soon: 0 };
    car.parts.forEach(p => { const s = partStatus(p, car.mileage); if (counts[s] != null) counts[s]++; });
    statusSummary.innerHTML = '';
    const defs = [
        ['overdue', 'Isteklo', 'status-overdue'],
        ['due', 'Na redu', 'status-due'],
        ['soon', 'Uskoro', 'status-soon']
    ];
    defs.forEach(([key, label, cls]) => {
        const pill = document.createElement('span');
        pill.className = 'summary-pill ' + cls;
        pill.style.opacity = counts[key] ? '1' : '0.4';
        pill.textContent = `${counts[key]} ${label}`;
        statusSummary.appendChild(pill);
    });
}

function renderServices() {
    const car = getActiveCar();
    servicesList.innerHTML = '';
    if (!car.services.length) {
        servicesList.innerHTML = '<div class="empty-hint">Nema servisa. Dodaj servis (npr. Mali / Veliki servis) i stavke koje treba uraditi.</div>';
        return;
    }
    car.services.forEach(svc => {
        const group = document.createElement('div');
        group.className = 'service-group';

        // ---- Header (same style as travelapp category headers): title + target pill | actions ----
        const head = document.createElement('div');
        head.className = 'svc-header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'd-flex align-items-center flex-wrap';
        const name = document.createElement('span');
        name.className = 'section-title svc-title';
        name.textContent = svc.name;
        titleWrap.appendChild(name);
        if (svc.targetFrom != null || svc.targetTo != null) {
            const tgt = document.createElement('span');
            tgt.className = 'service-target';
            tgt.textContent = rangeText(svc.targetFrom, svc.targetTo);
            titleWrap.appendChild(tgt);
        }

        const actions = document.createElement('div');
        actions.className = 'action-group';
        actions.append(
            iconBtn('fa-plus', 'Dodaj stavku', () => addServiceItem(svc.id)),
            iconBtn('fa-pen', 'Izmeni servis', () => editService(svc.id)),
            iconBtn('fa-trash', 'Obriši servis', () => deleteService(svc.id), 'act-del')
        );
        head.append(titleWrap, actions);
        group.appendChild(head);

        // ---- Simple bullet list of items ----
        if (svc.items.length) {
            const ul = document.createElement('ul');
            ul.className = 'list-group';
            svc.items.forEach((it, idx) => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex align-items-center gap-2';
                const bullet = document.createElement('span');
                bullet.className = 'svc-bullet';
                const text = document.createElement('span');
                text.className = 'flex-grow-1';
                text.textContent = it.name;
                const ctrls = document.createElement('span');
                ctrls.className = 'action-group';
                ctrls.appendChild(iconBtn('fa-xmark', 'Ukloni stavku', () => {
                    openConfirm(`Ukloni stavku "${it.name}" iz servisa "${svc.name}"?`, () => {
                        svc.items.splice(idx, 1); saveCars(); renderServices();
                    }, 'Ukloni');
                }, 'act-del'));
                li.append(bullet, text, ctrls);
                ul.appendChild(li);
            });
            group.appendChild(ul);
        } else {
            group.insertAdjacentHTML('beforeend', '<div class="empty-hint">Nema stavki. Klikni + da dodaš.</div>');
        }

        servicesList.appendChild(group);
    });
}

function renderParts() {
    const car = getActiveCar();
    sortSelect.value = sortMode;
    partsList.innerHTML = '';
    const parts = getSortedParts();
    if (!parts.length) {
        partsList.innerHTML = '<div class="empty-hint">Nema delova. Dodaj deo da pratiš kad je menjan i kad je sledeća zamena.</div>';
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'list-group';
    parts.forEach(p => {
        const st = partStatus(p, car.mileage);
        const meta = STATUS_META[st];
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';
        li.dataset.id = p.id;

        const left = document.createElement('div');
        left.className = 'd-flex align-items-center gap-2 flex-grow-1';
        const dot = document.createElement('span');
        dot.className = 'status-dot ' + meta.cls;
        const info = document.createElement('div');
        const noteHtml = p.note ? `<div class="sub-note">${escapeHtml(p.note)}</div>` : '';
        info.innerHTML = `<div class="part-name">${escapeHtml(p.name)}</div>` +
            `<div class="sub-note">Poslednja: <strong>${formatK(p.lastKm)}</strong> · Sledeća: <strong>${rangeText(p.nextFrom, p.nextTo)}</strong></div>` +
            noteHtml;
        left.append(dot, info);

        const right = document.createElement('div');
        right.className = 'd-flex align-items-center gap-2';
        const badge = document.createElement('span');
        badge.className = 'status-badge ' + meta.cls;
        badge.textContent = meta.label;
        const partActions = document.createElement('div');
        partActions.className = 'action-group';
        partActions.append(
            iconBtn('fa-check', 'Obavljeno (zamenjeno na trenutnoj kilometraži)', () => markPartDone(p.id), 'act-done'),
            iconBtn('fa-pen', 'Izmeni deo', () => openPartModal(p.id)),
            iconBtn('fa-trash', 'Obriši deo', () => deletePart(p.id), 'act-del')
        );
        right.append(badge, partActions);

        li.append(left, right);
        ul.appendChild(li);
    });
    partsList.appendChild(ul);
}

function renderNotes() {
    const car = getActiveCar();
    renderNoteList(problemsList, car.problems, 'problems', 'Nema zabeleženih problema.');
    renderNoteList(solutionsList, car.solutions, 'solutions', 'Nema zabeleženih rešenja.');
}

function renderNoteList(container, arr, key, emptyMsg) {
    container.innerHTML = '';
    if (!arr.length) { container.innerHTML = `<div class="empty-hint">${emptyMsg}</div>`; return; }
    const ul = document.createElement('ul');
    ul.className = 'list-group';
    arr.forEach((text, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start gap-2';
        const span = document.createElement('span');
        span.className = 'flex-grow-1';
        span.textContent = text;
        li.append(span);
        const ctrls = document.createElement('span');
        ctrls.className = 'action-group';
        ctrls.append(
            iconBtn('fa-pen', 'Izmeni', () => editNote(key, idx)),
            iconBtn('fa-trash', 'Obriši', () => {
                openConfirm(`Obriši "${text}"?`, () => { arr.splice(idx, 1); saveCars(); renderNotes(); });
            }, 'act-del')
        );
        li.append(ctrls);
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===================== ACTIONS =====================

// ---- Mileage ----
function openMileageModal() {
    const car = getActiveCar();
    openForm('Kilometraža', [
        { key: 'mileage', label: 'Trenutna kilometraža (km)', value: car.mileage, type: 'km', placeholder: 'npr. 162000 ili 162K' }
    ], (v) => {
        if (v.mileage == null) return 'Unesi ispravan broj.';
        car.mileage = v.mileage;
        saveCars();
        renderDashboard();
        renderParts();
        return null;
    });
}

// ---- Parts ----
function openPartModal(id) {
    const car = getActiveCar();
    const p = id ? car.parts.find(x => x.id === id) : null;
    openForm(p ? 'Izmeni deo' : 'Novi deo', [
        { key: 'name', label: 'Naziv', value: p ? p.name : '', type: 'text', placeholder: 'npr. Svećice' },
        { key: 'lastKm', label: 'Poslednja zamena (km)', value: p ? p.lastKm : '', type: 'km', placeholder: 'npr. 133000 ili 133K' },
        { key: 'nextFrom', label: 'Sledeća zamena — od (km)', value: p ? p.nextFrom : '', type: 'km', placeholder: 'npr. 160K' },
        { key: 'nextTo', label: 'Sledeća zamena — do (km)', value: p ? p.nextTo : '', type: 'km', placeholder: 'npr. 190K' },
        { key: 'note', label: 'Napomena', value: p ? p.note : '', type: 'textarea', placeholder: 'npr. Na 2 godine' }
    ], (v) => {
        if (!v.name) return 'Naziv ne može biti prazan.';
        if (p) {
            Object.assign(p, { name: v.name, lastKm: v.lastKm, nextFrom: v.nextFrom, nextTo: v.nextTo, note: v.note });
        } else {
            car.parts.push({ id: uid(), name: v.name, lastKm: v.lastKm, nextFrom: v.nextFrom, nextTo: v.nextTo, note: v.note });
        }
        saveCars();
        renderParts();
        renderDashboard();
        return null;
    });
}

function deletePart(id) {
    const car = getActiveCar();
    const p = car.parts.find(x => x.id === id);
    if (!p) return;
    openConfirm(`Obriši deo "${p.name}"?`, () => {
        car.parts = car.parts.filter(x => x.id !== id);
        saveCars(); renderParts(); renderDashboard();
    });
}

// Mark a part as replaced at the current mileage. If we know the previous interval
// (nextFrom/nextTo relative to the old lastKm), roll the next-due window forward.
function markPartDone(id) {
    const car = getActiveCar();
    const p = car.parts.find(x => x.id === id);
    if (!p) return;
    openConfirm(`Obeleži "${p.name}" kao zamenjen na ${formatFull(car.mileage)}?`, () => {
        if (p.lastKm != null && p.nextFrom != null) {
            const dFrom = p.nextFrom - p.lastKm;
            const dTo = p.nextTo != null ? p.nextTo - p.lastKm : null;
            p.nextFrom = car.mileage + dFrom;
            p.nextTo = dTo != null ? car.mileage + dTo : null;
        }
        p.lastKm = car.mileage;
        saveCars(); renderParts(); renderDashboard();
    }, 'Obeleži');
}

// ---- Services ----
function openServiceModal() {
    const car = getActiveCar();
    openForm('Novi servis', [
        { key: 'name', label: 'Naziv servisa', value: '', type: 'text', placeholder: 'npr. Mali servis' },
        { key: 'targetFrom', label: 'Ciljna kilometraža — od (km)', value: '', type: 'km', placeholder: 'npr. 161K' },
        { key: 'targetTo', label: 'Ciljna kilometraža — do (km)', value: '', type: 'km', placeholder: 'npr. 162K' }
    ], (v) => {
        if (!v.name) return 'Naziv ne može biti prazan.';
        car.services.push({ id: uid(), name: v.name, targetFrom: v.targetFrom, targetTo: v.targetTo, items: [] });
        saveCars(); renderServices();
        return null;
    });
}

function editService(id) {
    const car = getActiveCar();
    const svc = car.services.find(s => s.id === id);
    if (!svc) return;
    openForm('Izmeni servis', [
        { key: 'name', label: 'Naziv servisa', value: svc.name, type: 'text' },
        { key: 'targetFrom', label: 'Ciljna kilometraža — od (km)', value: svc.targetFrom, type: 'km' },
        { key: 'targetTo', label: 'Ciljna kilometraža — do (km)', value: svc.targetTo, type: 'km' }
    ], (v) => {
        if (!v.name) return 'Naziv ne može biti prazan.';
        Object.assign(svc, { name: v.name, targetFrom: v.targetFrom, targetTo: v.targetTo });
        saveCars(); renderServices();
        return null;
    });
}

function deleteService(id) {
    const car = getActiveCar();
    const svc = car.services.find(s => s.id === id);
    if (!svc) return;
    openConfirm(`Obriši servis "${svc.name}"?`, () => {
        car.services = car.services.filter(s => s.id !== id);
        saveCars(); renderServices();
    });
}

function addServiceItem(id) {
    const car = getActiveCar();
    const svc = car.services.find(s => s.id === id);
    if (!svc) return;
    openForm('Dodaj stavku', [
        { key: 'name', label: 'Stavka', value: '', type: 'text', placeholder: 'npr. Bobine' }
    ], (v) => {
        if (!v.name) return 'Stavka ne može biti prazna.';
        svc.items.push({ name: v.name, done: false });
        saveCars(); renderServices();
        return null;
    });
}

// ---- Problems / solutions ----
function openNoteModal(key) {
    const car = getActiveCar();
    const label = key === 'problems' ? 'Problem' : 'Rešenje';
    openForm('Novi ' + (key === 'problems' ? 'problem' : 'rešenje'), [
        { key: 'text', label, value: '', type: 'textarea', placeholder: '' }
    ], (v) => {
        if (!v.text) return 'Tekst ne može biti prazan.';
        car[key].push(v.text);
        saveCars(); renderNotes();
        return null;
    });
}

function editNote(key, idx) {
    const car = getActiveCar();
    openForm('Izmeni', [
        { key: 'text', label: key === 'problems' ? 'Problem' : 'Rešenje', value: car[key][idx], type: 'textarea' }
    ], (v) => {
        if (!v.text) return 'Tekst ne može biti prazan.';
        car[key][idx] = v.text;
        saveCars(); renderNotes();
        return null;
    });
}

// ---- Cars ----
function uniqueCarName(base) {
    let name = base, i = 2;
    while (cars.some(c => c.name === name)) name = `${base} (${i++})`;
    return name;
}

function openNewCarModal() {
    openForm('Novi auto', [
        { key: 'name', label: 'Naziv / model', value: '', type: 'text', placeholder: 'npr. Golf 7' },
        { key: 'mileage', label: 'Trenutna kilometraža (km)', value: '', type: 'km', placeholder: 'npr. 120000' }
    ], (v) => {
        if (!v.name) return 'Naziv ne može biti prazan.';
        if (cars.some(c => c.name === v.name)) return 'Auto sa tim nazivom već postoji.';
        cars.push(normalizeCar({ name: v.name, mileage: v.mileage ?? 0, services: [], parts: [], problems: [], solutions: [] }));
        activeCarName = v.name;
        saveCars(); renderAll();
        return null;
    });
}

function openRenameCarModal() {
    const car = getActiveCar();
    openForm('Preimenuj auto', [
        { key: 'name', label: 'Naziv / model', value: car.name, type: 'text' }
    ], (v) => {
        if (!v.name) return 'Naziv ne može biti prazan.';
        if (v.name !== car.name && cars.some(c => c.name === v.name)) return 'Auto sa tim nazivom već postoji.';
        car.name = v.name;
        activeCarName = v.name;
        saveCars(); renderAll();
        return null;
    });
}

function openDeleteCarModal() {
    if (cars.length <= 1) { openAlert('Mora postojati bar jedan auto.'); return; }
    const car = getActiveCar();
    openConfirm(`Obriši auto "${car.name}" i sve njegove podatke?`, () => {
        cars = cars.filter(c => c.name !== car.name);
        activeCarName = cars[0].name;
        saveCars(); renderAll();
    });
}

// ---- Backup / restore ----
function triggerDownload(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function downloadAllCars() {
    triggerDownload(JSON.stringify(cars, null, 2), 'auti_backup.json', 'application/json');
    showPopup();
}

function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const parsed = JSON.parse(e.target.result);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const valid = arr.length && arr.every(c => c && typeof c.name === 'string');
            if (!valid) { openAlert('Neispravan format fajla.'); }
            else {
                openConfirm('Ovo će zameniti SVE postojeće aute. Nastavi?', () => {
                    cars = arr.map(normalizeCar);
                    activeCarName = cars[0].name;
                    saveCars(); renderAll();
                }, 'Nastavi');
            }
        } catch (err) { openAlert('Neispravan JSON fajl.'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ===================== SYNC UI (Firebase) =====================
function updateSyncButton(connected) {
    const btn = document.getElementById('sync-btn');
    if (btn) btn.classList.toggle('sync-active', !!connected);
}

function updateSyncUI(st) {
    const disc = document.getElementById('sync-disconnected');
    const conn = document.getElementById('sync-connected');
    const unavail = document.getElementById('sync-unavailable');
    [disc, conn, unavail].forEach(el => el.classList.add('d-none'));
    if (!st || !st.available) {
        unavail.textContent = st && st.reason === 'not_loaded'
            ? 'Sinhronizacija se nije učitala (proveri internet / otvori preko http servera).'
            : 'Sinhronizacija nije podešena (dodaj Firebase konfiguraciju u js/firebase-sync.js).';
        unavail.classList.remove('d-none');
        updateSyncButton(false);
        return;
    }
    if (st.connected) {
        document.getElementById('sync-code-display').textContent = st.code;
        conn.classList.remove('d-none');
        updateSyncButton(true);
    } else {
        disc.classList.remove('d-none');
        updateSyncButton(false);
    }
}
window.__onSyncStatus = updateSyncUI;

function currentSyncStatus() {
    return (window.__cloud && window.__cloud.getStatus()) || { available: false };
}

function openSyncModal() {
    document.getElementById('sync-error').classList.add('d-none');
    document.getElementById('sync-code-input').value = '';
    updateSyncUI(currentSyncStatus());
    syncModal.show();
}

async function cloudCreateCode() {
    if (!window.__cloud) return;
    await window.__cloud.createCode();
    updateSyncUI(currentSyncStatus());
}

async function cloudConnect() {
    const input = document.getElementById('sync-code-input');
    const err = document.getElementById('sync-error');
    err.classList.add('d-none');
    if (!window.__cloud) return;
    const res = await window.__cloud.connect(input.value);
    if (res && res.ok) {
        input.value = '';
        updateSyncUI(currentSyncStatus());
    } else {
        err.textContent = res && res.error === 'not_found' ? 'Kod ne postoji.' : 'Neuspešno povezivanje. Proveri kod i internet.';
        err.classList.remove('d-none');
    }
}

function cloudDisconnect() {
    if (window.__cloud) window.__cloud.disconnect();
    updateSyncUI(currentSyncStatus());
}

// ----- Google Drive backup UI (js/gdrive-backup.js) -----
const DRIVE_ERRORS = {
    not_configured: 'Rezervna kopija nije podešena (dodaj Google Client ID u js/gdrive-backup.js).',
    insecure_origin: 'Rezervna kopija radi samo preko https adrese, ne kad se fajl otvori lokalno.',
    not_loaded: 'Google se nije učitao (proveri internet).',
    no_backup: 'Na Drive-u još nema rezervne kopije.',
    bad_file: 'Fajl s kopijom nije ispravan.',
    popup_closed: 'Prozor za prijavu je zatvoren.',
    auth_expired: 'Prijava je istekla — probaj ponovo.',
    busy: 'Već je u toku.'
};
function driveErrorText(code) {
    return DRIVE_ERRORS[code] || 'Nije uspelo. Proveri internet i probaj ponovo.';
}

function currentDriveStatus() {
    return (window.__drive && window.__drive.getStatus()) || { available: false };
}

function updateDriveUI(st) {
    const ready = document.getElementById('drive-ready');
    const unavail = document.getElementById('drive-unavailable');
    if (!ready || !unavail) return;
    if (!st || !st.available) {
        ready.classList.add('d-none');
        unavail.textContent = driveErrorText(st && st.reason);
        unavail.classList.remove('d-none');
        return;
    }
    unavail.classList.add('d-none');
    ready.classList.remove('d-none');
    document.getElementById('drive-backup-btn').disabled = !!st.busy;
    document.getElementById('drive-restore-btn').disabled = !!st.busy;
    const last = document.getElementById('drive-last');
    last.textContent = st.lastBackup
        ? 'Poslednja kopija: ' + new Date(st.lastBackup).toLocaleString('sr-RS')
        : 'Još nema napravljene kopije sa ovog uređaja.';
}
window.__onDriveStatus = updateDriveUI;

function driveMessage(text, ok) {
    const el = document.getElementById('drive-message');
    el.textContent = text;
    el.className = 'small mt-2 ' + (ok ? 'text-success' : 'text-danger');
}

function openDriveModal() {
    document.getElementById('drive-message').className = 'small mt-2 d-none';
    driveCancelRestore();
    updateDriveUI(currentDriveStatus());
    driveModal.show();
}

async function driveBackup() {
    if (!window.__drive) return;
    driveMessage('Čuvanje u toku…', true);
    const res = await window.__drive.backup();
    updateDriveUI(currentDriveStatus());
    driveMessage(res.ok ? 'Kopija je sačuvana na Drive.' : driveErrorText(res.error), res.ok);
}

// Look the backup up first, so an empty Drive reports that instead of making the
// user confirm a destructive action that would have had nothing to restore.
async function driveAskRestore() {
    if (!window.__drive) return;
    driveMessage('Provera kopije…', true);
    const res = await window.__drive.check();
    updateDriveUI(currentDriveStatus());
    if (!res.ok) { driveMessage(driveErrorText(res.error), false); return; }
    document.getElementById('drive-message').className = 'small mt-2 d-none';
    document.getElementById('drive-restore-when').textContent =
        'Kopija od ' + new Date(res.savedAt).toLocaleString('sr-RS') + '.';
    document.getElementById('drive-restore-confirm').classList.remove('d-none');
}
function driveCancelRestore() {
    const el = document.getElementById('drive-restore-confirm');
    if (el) el.classList.add('d-none');
}

async function driveRestore() {
    if (!window.__drive) return;
    driveCancelRestore();
    driveMessage('Vraćanje u toku…', true);
    const res = await window.__drive.restore();
    updateDriveUI(currentDriveStatus());
    driveMessage(res.ok ? 'Podaci su vraćeni iz kopije.' : driveErrorText(res.error), res.ok);
}

function copySyncCode() {
    const code = document.getElementById('sync-code-display').textContent;
    const btn = document.getElementById('copy-code-btn');
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Kopirano!';
        setTimeout(() => { btn.textContent = original; }, 1500);
    });
}

// ===================== MISC =====================
function showPopup() {
    const popup = document.getElementById('copy-popup');
    popup.style.display = 'block';
    clearTimeout(popup.timer);
    popup.timer = setTimeout(() => { popup.style.display = 'none'; }, 2000);
}
function hidePopup() { document.getElementById('copy-popup').style.display = 'none'; }

function updateLocalStorageInfo() {
    const usedBytes = new Blob(Object.values(localStorage)).size;
    const usedKB = (usedBytes / 1024).toFixed(2);
    localStorageInfo.innerHTML = `<strong>Storage:</strong> ${usedKB} KB / 5 MB`;
}

renderAll();
