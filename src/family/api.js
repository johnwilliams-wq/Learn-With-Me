// The few calls the family account needs, made directly with fetch: sign-in, two tables and a
// folder of pictures. (No library: the app has no dependencies, and this is all it uses.)
// Every call has a time limit, so nothing in the app ever waits for the network without end.
//
// Errors are thrown as FamilyError with a `code` the screens can explain:
//   network      could not reach it (offline, or it took too long)
//   auth         not signed in any more (the sign-in ran out and could not be renewed)
//   credentials  wrong email or password        confirm   the email address is not confirmed yet
//   exists       there is already an account    weak      the password is too short
//   closed       new accounts are switched off  busy      too many tries; wait a little
//   setup        the database is not set up yet server    anything else

export class FamilyError extends Error {
  constructor(code, message = code, status = 0) {
    super(message);
    this.name = 'FamilyError';
    this.code = code;
    this.status = status;
  }
}

const AUTH_CODES = {
  invalid_credentials: 'credentials', email_not_confirmed: 'confirm', user_already_exists: 'exists', email_exists: 'exists',
  weak_password: 'weak', signup_disabled: 'closed', over_request_rate_limit: 'busy', over_email_send_rate_limit: 'busy',
};
const NAME = /^[a-z0-9]{6,40}$/; // a picture's name: nothing else ever goes into an address

/**
 * `session` = { get(), set(session | null) }: where the sign-in is kept (the caller stores it).
 * A session is { access_token, refresh_token, expires_at (seconds), user: { id, email } }.
 */
export function createApi({ url, key, session, fetchFn = (...a) => globalThis.fetch(...a), timeout = 12000 }) {
  let renewing = null; // one renewal at a time: a second one would make the first one's result useless

  async function send(method, path, { body, raw, headers = {}, token, blob = false, ms = timeout } = {}) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ms);
    let res;
    let got; // the whole answer is read inside the time limit, whether it is good news or bad
    try {
      res = await fetchFn(url + path, {
        method,
        signal: stop.signal,
        cache: 'no-store',
        headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
      got = res.ok && blob ? await res.blob() : await res.text();
    } catch (e) {
      throw new FamilyError('network', String(e?.message || e));
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      if (blob) return got;
      try { return got ? JSON.parse(got) : null; } catch { throw new FamilyError('server', 'unreadable answer', res.status); }
    }
    let info = {};
    try { info = JSON.parse(got) || {}; } catch { /* no details */ }
    const message = String(info.msg || info.message || info.error_description || info.error || res.statusText || '');
    let code = AUTH_CODES[info.error_code] || 'server';
    if (code === 'server') {
      if (res.status === 429) code = 'busy';
      else if (/invalid login credentials/i.test(message)) code = 'credentials';
      else if (/not confirmed/i.test(message)) code = 'confirm';
      else if (/already registered/i.test(message)) code = 'exists';
      else if (/password should be/i.test(message)) code = 'weak';
      else if (/signups not allowed/i.test(message)) code = 'closed';
      else if (info.code === 'PGRST205' || info.code === 'PGRST202' || /bucket not found/i.test(message)) code = 'setup';
      else if (res.status === 401 || /jwt|token is expired|invalid claim/i.test(message)) code = 'auth';
    }
    throw new FamilyError(code, message, res.status);
  }

  function keep(res) {
    if (!res?.access_token || !res.user?.id) return null;
    const next = {
      access_token: res.access_token,
      refresh_token: res.refresh_token || '',
      expires_at: Math.floor(Date.now() / 1000) + (Number(res.expires_in) || 3600), // by this device's own clock, which may be wrong but is the one compared with
      user: { id: res.user.id, email: res.user.email || '' },
    };
    session.set(next);
    return next;
  }

  async function renewNow() {
    const now = session.get();
    try {
      if (!now?.refresh_token) throw new FamilyError('auth');
      const next = keep(await send('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: now.refresh_token } }));
      if (!next) throw new FamilyError('auth');
      return next;
    } catch (e) {
      // Refused (not merely unreachable): this sign-in is over. A grown-up signs in again.
      if (e.code !== 'network' && e.code !== 'busy' && !(e.status >= 500)) {
        session.set(null);
        throw new FamilyError('auth', e.message, e.status);
      }
      throw e;
    }
  }
  function renew() {
    if (renewing) return renewing;
    // (cleared only by the very renewal that set it - also when that one fails before it has waited for anything)
    const mine = renewNow().finally(() => { if (renewing === mine) renewing = null; });
    renewing = mine;
    return mine;
  }

  /** A call as the signed-in family: renews the sign-in when it is about to run out, or once when it is refused. */
  async function authed(method, path, opts = {}) {
    let now = session.get();
    if (!now) throw new FamilyError('auth');
    if (now.expires_at * 1000 - Date.now() < 60000) now = await renew();
    try {
      return await send(method, path, { ...opts, token: now.access_token });
    } catch (e) {
      if (e.code !== 'auth') throw e;
      now = await renew();
      return send(method, path, { ...opts, token: now.access_token });
    }
  }

  const me = () => {
    const id = session.get()?.user?.id || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FamilyError('auth');
    return id;
  };
  const file = (name) => {
    if (!NAME.test(name)) throw new FamilyError('server', 'not a picture name');
    return `${me()}/${name}`;
  };
  const prefer = (...parts) => ({ Prefer: parts.join(',') });

  return {
    // ---- the sign-in
    /** Returns true when signed in straight away, false when the email address must be confirmed first. */
    async signUp(email, password) {
      const res = await send('POST', '/auth/v1/signup', { body: { email, password } });
      // When addresses must be confirmed, an address that has an account already is answered with a
      // made-up user (no identities) and no email is sent: say what is really the matter.
      if (!res?.access_token && Array.isArray(res?.identities) && !res.identities.length) throw new FamilyError('exists', 'User already registered', 422);
      return !!keep(res);
    },
    async signIn(email, password) {
      if (!keep(await send('POST', '/auth/v1/token?grant_type=password', { body: { email, password } }))) throw new FamilyError('server', 'no session');
    },
    async signOut() {
      const now = session.get();
      session.set(null);
      if (now) await send('POST', '/auth/v1/logout?scope=local', { token: now.access_token }).catch(() => {});
    },
    userId: () => session.get()?.user?.id || '',

    // ---- the two tables (the database only ever shows a family its own rows)
    get: (table, query) => authed('GET', `/rest/v1/${table}?${query}`).then((rows) => (Array.isArray(rows) ? rows : [])),
    /** Add a row. `ignore`: when it is there already, leave it as it is. Returns the rows that were added. */
    insert: (table, row, { ignore = false } = {}) =>
      authed('POST', `/rest/v1/${table}`, { body: row, headers: prefer('return=representation', ...(ignore ? ['resolution=ignore-duplicates'] : [])) }).then((rows) => (Array.isArray(rows) ? rows : [])),
    /** Change the rows that match `query`. Returns the rows that were changed. */
    patch: (table, query, changes) =>
      authed('PATCH', `/rest/v1/${table}?${query}`, { body: changes, headers: prefer('return=representation') }).then((rows) => (Array.isArray(rows) ? rows : [])),
    del: (table, query) => authed('DELETE', `/rest/v1/${table}?${query}`),
    rpc: (fn, args = {}) => authed('POST', `/rest/v1/rpc/${fn}`, { body: args }),

    // ---- pictures: the family's own folder in the private bucket "photos"
    upload: (name, picture) => authed('POST', `/storage/v1/object/photos/${file(name)}`, { raw: picture, headers: { 'Content-Type': picture.type || 'image/jpeg', 'x-upsert': 'true' }, ms: 30000 }),
    download: (name) => authed('GET', `/storage/v1/object/photos/${file(name)}`, { blob: true, ms: 20000 }),
    /** The pictures in the folder: [{ name, created_at }]. */
    list: () => authed('POST', '/storage/v1/object/list/photos', { body: { prefix: me(), limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } } })
      .then((rows) => (Array.isArray(rows) ? rows.filter((o) => o && NAME.test(o.name || '')) : [])),
    remove: (names) => authed('DELETE', '/storage/v1/object/photos', { body: { prefixes: names.filter((n) => NAME.test(n)).map(file) } }),
  };
}
