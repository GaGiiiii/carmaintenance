// Firebase device sync (sync-code model). Classic script using the Firebase
// *compat* SDK (loaded via <script src> in index.html), so it also runs when the
// page is opened directly as a local file:// — unlike ES modules, which browsers
// block on file:// origins.
//
// Talks to the app via the window.__* bridge defined in js/state.js and js/app.js.
// Sync is OFF until you paste your own project's config below (leave as-is to run
// the app fully offline with localStorage only).

(function () {
    // ===== FIREBASE CONFIG (shared travelapp project; this app uses its own 'carsyncs' collection) =====
    const firebaseConfig = {
        apiKey: "AIzaSyBpzQJgA0la8m9J7ixUDGf43OxnRCogI9g",
        authDomain: "travelapp-8b457.firebaseapp.com",
        projectId: "travelapp-8b457",
        storageBucket: "travelapp-8b457.firebasestorage.app",
        messagingSenderId: "635667620374",
        appId: "1:635667620374:web:aa2027d4d1ae131a554b37",
        measurementId: "G-TTKJG9HDLX"
    };
    // ===========================================

    const COLLECTION = 'carsyncs';
    const sdkLoaded = typeof firebase !== 'undefined' && firebase.firestore;
    const configured = sdkLoaded && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

    let db = null;
    let unsub = null;
    let currentCode = null;
    let pushTimer = null;

    function status() {
        return {
            available: configured,
            reason: sdkLoaded ? (configured ? null : 'not_configured') : 'not_loaded',
            connected: !!currentCode,
            code: currentCode
        };
    }
    function notify() {
        if (window.__onSyncStatus) window.__onSyncStatus(status());
    }

    function randomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars (0/O, 1/I)
        const arr = new Uint32Array(8);
        crypto.getRandomValues(arr);
        let code = '';
        for (let i = 0; i < 8; i++) code += chars[arr[i] % chars.length];
        return code;
    }

    function subscribe(code) {
        if (unsub) unsub();
        unsub = db.collection(COLLECTION).doc(code).onSnapshot(snap => {
            if (snap.metadata.hasPendingWrites) return; // ignore our own local write echo
            const data = snap.data();
            if (data && Array.isArray(data.cars) && window.__applyRemoteCars) {
                window.__applyRemoteCars(data.cars);
            }
        }, err => console.error('Sync listener error:', err));
        currentCode = code;
        localStorage.setItem('carSyncCode', code);
        notify();
    }

    window.__cloud = {
        getStatus: status,
        async createCode() {
            if (!configured) return null;
            const code = randomCode();
            const cars = (window.__getLocalCars && window.__getLocalCars()) || [];
            await db.collection(COLLECTION).doc(code).set({
                cars, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            subscribe(code);
            return code;
        },
        async connect(codeRaw) {
            if (!configured) return { ok: false, error: sdkLoaded ? 'not_configured' : 'not_loaded' };
            const code = (codeRaw || '').trim().toUpperCase();
            if (!code) return { ok: false, error: 'empty' };
            try {
                const ref = db.collection(COLLECTION).doc(code);
                const snap = await ref.get();
                if (!snap.exists) return { ok: false, error: 'not_found' };
                subscribe(code);
                const data = snap.data();
                if (data && Array.isArray(data.cars) && window.__applyRemoteCars) {
                    window.__applyRemoteCars(data.cars);
                }
                return { ok: true };
            } catch (e) {
                console.error('Sync connect error:', e);
                return { ok: false, error: 'network' };
            }
        },
        disconnect() {
            if (unsub) { unsub(); unsub = null; }
            currentCode = null;
            localStorage.removeItem('carSyncCode');
            notify();
        },
        push(cars) {
            if (!configured || !currentCode) return;
            clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                db.collection(COLLECTION).doc(currentCode).set({
                    cars, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(e => console.error('Sync push error:', e));
            }, 500);
        }
    };

    if (configured) {
        const app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore(app);
        const saved = localStorage.getItem('carSyncCode');
        if (saved) subscribe(saved);
    }
    notify();
})();
