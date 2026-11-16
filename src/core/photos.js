// Pictures, kept on this device (IndexedDB) and shrunk to a sensible size.
//   chore photos      deleted as soon as a grown-up has approved the chore or sent it back
//   reward pictures   chosen by a grown-up for a reward in the mine; kept until the
//                     reward is removed or gets another picture
// With a family account (src/family/sync.js) the same pictures are also kept in the family's
// private folder, so a grown-up's own device can show them: a picture that is not on this
// device is then looked for there (setPhotoSource).

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

let elsewhere = null;
/** Where to look for a picture that is not on this device: (id) => a Blob, or null. */
export const setPhotoSource = (fn) => { elsewhere = fn; };

/** Save a picture; returns its id. (Stored as raw bytes, which every Safari version handles.) `id`: keep it under this one. */
export async function savePhoto(blob, id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`) {
  const data = await blob.arrayBuffer();
  await run('readwrite', (s) => s.put({ type: blob.type || 'image/jpeg', data, t: Date.now() }, id));
  return id;
}

/** A picture that is on this device (null when it is not). */
export async function localPhoto(id) {
  if (!id) return null;
  try {
    const rec = await run('readonly', (s) => s.get(id));
    return rec ? new Blob([rec.data], { type: rec.type }) : null;
  } catch {
    return null;
  }
}

export const hasPhoto = async (id) => !!(await localPhoto(id));

/** A picture, from this device or - with a family account - from the family's folder. */
export async function loadPhoto(id) {
  if (!id) return null;
  const here = await localPhoto(id);
  if (here || !elsewhere) return here;
  try {
    return (await elsewhere(id)) || null;
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

/** Delete every stored picture that is not in `keep` (after a backup is restored: pictures nothing points to any more). */
export async function keepOnlyPhotos(keep) {
  try {
    const wanted = new Set(keep.filter(Boolean));
    const all = await run('readonly', (s) => s.getAllKeys());
    for (const id of all || []) if (!wanted.has(id)) await deletePhoto(id);
  } catch { /* nothing to tidy */ }
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
      const pen = canvas.getContext('2d');
      pen.fillStyle = '#ffffff'; // a see-through picture would otherwise come out on black
      pen.fillRect(0, 0, canvas.width, canvas.height);
      pen.drawImage(img, 0, 0, canvas.width, canvas.height);
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

/**
 * Show a stored picture inside `el` (it replaces what is there). When the picture is missing
 * (another device, a restored backup) `el` is left as it is, so the emoji underneath stays.
 * Returns a function that frees the picture again; call it when the screen goes away.
 */
export function showPhoto(el, id, alt = '') {
  let url = null;
  let gone = false;
  if (id) {
    loadPhoto(id).then((blob) => {
      if (!blob || gone) return;
      url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.alt = alt;
      img.src = url;
      el.replaceChildren(img);
      el.classList.add('has-photo');
    });
  }
  return () => {
    gone = true;
    if (url) URL.revokeObjectURL(url);
  };
}
