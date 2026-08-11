// Google Drive backup — manual, button-press backup and restore of this app's
// data into the user's own Google Drive. Classic script, no build step, no server.
//
// Auth is browser-only, via Google Identity Services: the access token lives in
// memory and expires in ~1h, which is all a click-driven backup needs. There is
// no refresh token, so unattended/scheduled backups are NOT possible from here —
// that would require a backend holding long-lived credentials.
//
// The scope is drive.file, which grants access only to files this app itself
// created. That keeps it a non-sensitive scope (no Google verification review)
// and means the app can never see the rest of the user's Drive.
//
// OAuth requires an http(s) origin, so this stays disabled on file:// — unlike
// the Firebase sync module, which deliberately still works there.
//
// Talks to the app via the window.__* bridge in js/state.js and js/app.js.

(function () {
    // ===== PASTE YOUR GOOGLE OAUTH CLIENT ID HERE =====
    const CLIENT_ID = "635667620374-nusvfiqr7486mqrf9cj398k3bbiu6voe.apps.googleusercontent.com";
    // ==================================================

    // ---- per-app configuration ----
    const APP_ID = 'carmaintenance';
    const FILE_NAME = 'carmaintenance-backup.json';
    const LAST_KEY = 'driveLastBackup';
    const getData = () => (window.__getLocalCars && window.__getLocalCars()) || [];
    const applyData = (d) => window.__applyRestoredCars && window.__applyRestoredCars(d);
    const isValidData = (d) => Array.isArray(d);

    const SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
    const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

    const configured = CLIENT_ID && CLIENT_ID !== "PASTE_YOUR_OAUTH_CLIENT_ID_HERE";
    // Google only accepts https origins, plus localhost for development.
    const secureOrigin = location.protocol === 'https:'
        || ['localhost', '127.0.0.1'].includes(location.hostname);

    let tokenClient = null;
    let accessToken = null;
    let tokenExpiry = 0;
    let busy = false;

    const gisLoaded = () => typeof google !== 'undefined'
        && google.accounts && google.accounts.oauth2;

    function status() {
        let reason = null;
        if (!configured) reason = 'not_configured';
        else if (!secureOrigin) reason = 'insecure_origin';
        else if (!gisLoaded()) reason = 'not_loaded';
        return {
            available: reason === null,
            reason,
            busy,
            signedIn: !!accessToken && Date.now() < tokenExpiry,
            lastBackup: localStorage.getItem(LAST_KEY) || null
        };
    }
    function notify() { if (window.__onDriveStatus) window.__onDriveStatus(status()); }

    // ---- auth ----
    // Resolves with an access token, opening Google's popup only when the user
    // has not already granted the scope in this browser session.
    function requestToken() {
        return new Promise((resolve, reject) => {
            if (!tokenClient) {
                if (!gisLoaded()) return reject(new Error('not_loaded'));
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID, scope: SCOPE, callback: () => { }
                });
            }
            tokenClient.callback = (resp) => {
                if (resp && resp.access_token) {
                    accessToken = resp.access_token;
                    // Renew a minute early so a long upload can't straddle expiry.
                    tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
                    resolve(accessToken);
                } else {
                    reject(new Error((resp && resp.error) || 'auth_failed'));
                }
            };
            tokenClient.error_callback = (err) => reject(new Error((err && err.type) || 'popup_closed'));
            tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    async function token() {
        if (accessToken && Date.now() < tokenExpiry) return accessToken;
        return requestToken();
    }

    async function api(url, opts = {}) {
        const t = await token();
        const res = await fetch(url, {
            ...opts,
            headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t }
        });
        if (res.status === 401 || res.status === 403) {
            accessToken = null; tokenExpiry = 0;   // force a fresh consent next try
            throw new Error('auth_expired');
        }
        if (!res.ok) throw new Error('http_' + res.status);
        return res;
    }

    // ---- Drive helpers ----
    // With drive.file scope this only ever matches our own backup file.
    async function findFile() {
        const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
        const res = await api(`${FILES_URL}?q=${q}&spaces=drive&fields=files(id,modifiedTime)&pageSize=1`);
        const data = await res.json();
        return (data.files && data.files[0]) || null;
    }

    async function uploadJson(payload) {
        const body = JSON.stringify(payload, null, 2);
        const existing = await findFile();
        if (existing) {
            await api(`${UPLOAD_URL}/${existing.id}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            return;
        }
        const boundary = 'gdb' + Math.random().toString(36).slice(2);
        const meta = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
        const multipart =
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
            `--${boundary}--`;
        await api(`${UPLOAD_URL}?uploadType=multipart`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body: multipart
        });
    }

    window.__drive = {
        getStatus: status,

        // Overwrites the single backup file in the user's Drive with current data.
        async backup() {
            const st = status();
            if (!st.available) return { ok: false, error: st.reason };
            if (busy) return { ok: false, error: 'busy' };
            busy = true; notify();
            try {
                const savedAt = new Date().toISOString();
                await uploadJson({ app: APP_ID, version: 1, savedAt, data: getData() });
                localStorage.setItem(LAST_KEY, savedAt);
                return { ok: true, savedAt, fileName: FILE_NAME };
            } catch (e) {
                console.error('Drive backup error:', e);
                return { ok: false, error: e.message || 'failed' };
            } finally { busy = false; notify(); }
        },

        // Replaces local data with the backup file's contents.
        async restore() {
            const st = status();
            if (!st.available) return { ok: false, error: st.reason };
            if (busy) return { ok: false, error: 'busy' };
            busy = true; notify();
            try {
                const file = await findFile();
                if (!file) return { ok: false, error: 'no_backup' };
                const res = await api(`${FILES_URL}/${file.id}?alt=media`);
                const payload = await res.json();
                // Tolerate a bare payload in case an older/hand-made file is found.
                const data = (payload && payload.data !== undefined) ? payload.data : payload;
                if (!isValidData(data)) return { ok: false, error: 'bad_file' };
                applyData(data);
                return { ok: true, savedAt: (payload && payload.savedAt) || file.modifiedTime };
            } catch (e) {
                console.error('Drive restore error:', e);
                return { ok: false, error: e.message || 'failed' };
            } finally { busy = false; notify(); }
        },

        signOut() {
            if (accessToken && gisLoaded()) google.accounts.oauth2.revoke(accessToken, () => { });
            accessToken = null; tokenExpiry = 0;
            notify();
        }
    };

    // The GIS script is async, so it may land after this file runs.
    if (!gisLoaded()) window.addEventListener('load', notify);
    notify();
})();
