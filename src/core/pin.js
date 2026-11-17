// The grown-ups' PIN. It is chosen on the device the first time the parent area is opened
// and only a salted hash is stored (never the PIN itself, and nothing about it is in the code).

const MAX_TRIES = 5;
const LOCK_MS = 30000;

async function digest(text) {
  try {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle needs https (or localhost). Fall back to a simple hash so the lock still works.
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    return `x${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
  }
}

function newSalt() {
  const a = new Uint8Array(12);
  (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const validPin = (pin) => /^\d{4,8}$/.test(pin);
export const hasPin = (store) => !!store.get().admin.hash;

export async function setPin(store, pin) {
  if (!validPin(pin)) throw new Error('A PIN is 4 to 8 digits');
  const salt = newSalt();
  const hash = await digest(`${salt}:${pin}`);
  store.update((s) => { s.admin = { hash, salt, tries: 0, lockUntil: 0 }; });
}

/** @returns {'ok' | 'wrong' | 'locked'} - five wrong tries lock the door for half a minute. */
export async function checkPin(store, pin, now = Date.now()) {
  const a = store.get().admin;
  // (never longer than the lock itself: a clock that was put back must not shut a grown-up out for hours)
  if (a.lockUntil && now < a.lockUntil && a.lockUntil - now <= LOCK_MS) return 'locked';
  const ok = (await digest(`${a.salt}:${pin}`)) === a.hash;
  store.update((s) => {
    if (ok) {
      s.admin.tries = 0;
      s.admin.lockUntil = 0;
    } else {
      s.admin.tries = (s.admin.tries || 0) + 1;
      if (s.admin.tries >= MAX_TRIES) {
        s.admin.tries = 0;
        s.admin.lockUntil = now + LOCK_MS;
      }
    }
  });
  return ok ? 'ok' : store.get().admin.lockUntil > now ? 'locked' : 'wrong';
}
