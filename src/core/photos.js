// Chore photos. They are kept on this device only (IndexedDB), shrunk to a sensible size,
// and deleted as soon as a grown-up has approved the chore or sent it back.

const DB = 'lwm-photos';
const STORE = 'photos';

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('no photo storage on this device'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Save a picture; returns its id. (Stored as raw bytes, which every Safari version handles.) */
export async function savePhoto(blob) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const data = await blob.arrayBuffer();
  await run('readwrite', (s) => s.put({ type: blob.type || 'image/jpeg', data, t: Date.now() }, id));
  return id;
}

export async function loadPhoto(id) {
  if (!id) return null;
  try {
    const rec = await run('readonly', (s) => s.get(id));
    return rec ? new Blob([rec.data], { type: rec.type }) : null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id) {
  if (!id) return;
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch { /* nothing to clean up */ }
}

/** Shrink a camera picture to at most `max` pixels on its long side, as a JPEG. */
export function shrinkImage(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not read the picture'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read the picture'));
    };
    img.src = url;
  });
}
