// ── DB.JS ──────────────────────────────────────────
const DB_NAME = 'FieldMOPCO';
const DB_VER  = 1;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      // Motors store
      if (!db.objectStoreNames.contains('motors')) {
        const ms = db.createObjectStore('motors', { keyPath: 'tag' });
        ms.createIndex('area', 'area', { unique: false });
      }
      // Rounds store
      if (!db.objectStoreNames.contains('rounds')) {
        const rs = db.createObjectStore('rounds', { keyPath: 'id' });
        rs.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

const DB = {
  // ── MOTORS ──────────────────────────────────────
  async saveMotor(motor) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motors', 'readwrite');
      tx.objectStore('motors').put(motor);
      tx.oncomplete = () => resolve(motor);
      tx.onerror    = e => reject(e.target.error);
    });
  },

  async saveMotors(motors) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motors', 'readwrite');
      const store = tx.objectStore('motors');
      motors.forEach(m => store.put(m));
      tx.oncomplete = () => resolve(motors.length);
      tx.onerror    = e => reject(e.target.error);
    });
  },

  async getAllMotors() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motors', 'readonly');
      const req = tx.objectStore('motors').getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async getMotor(tag) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motors', 'readonly');
      const req = tx.objectStore('motors').get(tag);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async getMotorCount() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motors', 'readonly');
      const req = tx.objectStore('motors').count();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  // ── ROUNDS ──────────────────────────────────────
  async saveRound(round) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rounds', 'readwrite');
      tx.objectStore('rounds').put(round);
      tx.oncomplete = () => resolve(round);
      tx.onerror    = e => reject(e.target.error);
    });
  },

  async getAllRounds() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rounds', 'readonly');
      const req = tx.objectStore('rounds').index('date').getAll();
      req.onsuccess = e => resolve(e.target.result.reverse());
      req.onerror   = e => reject(e.target.error);
    });
  },

  async getRound(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rounds', 'readonly');
      const req = tx.objectStore('rounds').get(id);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async deleteRound(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('rounds', 'readwrite');
      tx.objectStore('rounds').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  },
};
