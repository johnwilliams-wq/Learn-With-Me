// Where the family account lives: the owner's own small database (see CLAUDE.md, "The family
// database"). The key below is the PUBLISHABLE one - it only says which project to talk to and
// is meant to be public; what a visitor may read or write is decided by the sign-in and by the
// database's own rules (a family sees its own rows and files, nobody else's). The database
// password and the secret keys are never in this repository.

const PROJECT = { url: 'https://kfgtrroainxuoqfncdgf.supabase.co', key: 'sb_publishable_zTHjnFmXLmre0sRYC07MgQ_28ycPoTG' };

/**
 * Automated tests only: `?family=http://127.0.0.1:<port>` points the app at a stand-in server.
 * It is honoured only when the app itself is being served from this very computer, and only
 * for an address on this computer - a link to the published game can never redirect it.
 */
export function familyConfig(loc = globalThis.location) {
  const here = /^(localhost|127\.0\.0\.1)$/;
  try {
    const wanted = loc && here.test(loc.hostname) ? new URLSearchParams(loc.search).get('family') : null;
    if (wanted) {
      const u = new URL(wanted);
      if (u.protocol === 'http:' && here.test(u.hostname)) return { url: u.origin, key: 'test-key' };
    }
  } catch { /* not an address: use the real one */ }
  return { ...PROJECT };
}
