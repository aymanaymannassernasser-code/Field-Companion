// ── DB.JS — IndexedDB wrapper ──────────────────────
const DB_NAME = 'FieldCompanionDB';
const DB_VER  = 1;
const STORE   = 'entries';

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('tag',      'tag',      { unique: false });
        store.createIndex('type',     'type',     { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('ts',       'ts',       { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

const DB = {
  async save(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve(entry);
      tx.onerror    = e => reject(e.target.error);
    });
  },

  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('ts').getAll();
      req.onsuccess = e => resolve(e.target.result.reverse());
      req.onerror   = e => reject(e.target.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async delete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  },
};
