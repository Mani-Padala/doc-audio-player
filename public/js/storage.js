// ── storage.js ────────────────────────────────────────────────────────────────
// Manages all application state.
// API key: memory only — never written to localStorage or sessionStorage.
// Chunks + TOC: sessionStorage — survives refresh, cleared on tab close.
// ─────────────────────────────────────────────────────────────────────────────

// ── API Key (memory only) ─────────────────────────────────────────────────────
let _key = '';

export const apiKeyStore = {
  set: (val) => { _key = (val || '').trim(); },
  get: ()      => _key,
  clear: ()    => { _key = ''; },
};

// ── Chunks (sessionStorage) ───────────────────────────────────────────────────
export const chunksStore = {
  save(chunks) {
    try { sessionStorage.setItem('dap_chunks', JSON.stringify(chunks)); } catch (_) {}
  },
  load() {
    try { const r = sessionStorage.getItem('dap_chunks'); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  },
  clear() { sessionStorage.removeItem('dap_chunks'); },
};

// ── TOC (sessionStorage) ──────────────────────────────────────────────────────
export const tocStore = {
  save(toc) {
    try { sessionStorage.setItem('dap_toc', JSON.stringify(toc)); } catch (_) {}
  },
  load() {
    try { const r = sessionStorage.getItem('dap_toc'); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  },
  clear() { sessionStorage.removeItem('dap_toc'); },
};

// ── Filename (sessionStorage) ─────────────────────────────────────────────────
export const filenameStore = {
  save: (name) => sessionStorage.setItem('dap_filename', name),
  load: ()     => sessionStorage.getItem('dap_filename') || '',
  clear: ()    => sessionStorage.removeItem('dap_filename'),
};

// ── Clear everything ──────────────────────────────────────────────────────────
export function clearAll() {
  apiKeyStore.clear();
  chunksStore.clear();
  tocStore.clear();
  filenameStore.clear();
}
