// A stand-in for the family database, for tests: the handful of Supabase calls the app makes
// (sign-in, the two tables, the folder of pictures), answered from memory on this computer.
// It follows the real services' addresses, status codes and error bodies as far as the app
// depends on them, and it enforces the same rule as the real database: a family sees and
// changes only its own rows and files. (The real rules themselves are tested against a real
// Postgres by tools/db/check.sh; tests/e2e/live-family.cjs tries the real project.)
//
//   const server = await startFamilyServer();   server.url, server.db, server.requests
//   server.expireTokens()    every sign-in has "run out" (the app must renew it)
//   server.revoke()          ... and cannot be renewed either
//   server.setDown(true)     nobody answers
//   server.setConfirm(true)  new accounts must confirm their email address first
//   server.failOnce(/re/)    the next request whose "METHOD /path" matches is answered with a 500

const http = require('node:http');
const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLES = {
  family_state: { key: 'owner', fresh: () => ({ data: {}, player_device: null, updated_at: new Date().toISOString() }) },
  commands: { key: 'id', fresh: () => ({ id: crypto.randomUUID(), device: '', payload: {}, created_at: new Date().toISOString(), applied_at: null, outcome: null }) },
};
const MIME = ['image/jpeg', 'image/png', 'image/webp'];

function startFamilyServer() {
  const db = { users: [], family_state: [], commands: [], objects: new Map() }; // objects: 'uid/name' -> { type, bytes, created_at }
  const tokens = new Map(); // access token -> { user, dead }
  const refresh = new Map(); // refresh token -> user id
  const requests = [];
  let down = false;
  let confirm = false;
  let failing = null;
  let tick = 0; // makes created_at strictly increasing even within one millisecond

  const session = (user) => {
    const access_token = `at-${crypto.randomUUID()}`;
    const refresh_token = `rt-${crypto.randomUUID()}`;
    tokens.set(access_token, { user: user.id, dead: false });
    refresh.set(refresh_token, user.id);
    return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token, user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' } };
  };

  // ---- the two tables ------------------------------------------------------
  function matcher(params) {
    const tests = [];
    for (const [col, raw] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(col)) continue;
      const m = /^(not\.)?(eq|lt|gt|is|in)\.(.*)$/s.exec(raw);
      if (!m) throw Object.assign(new Error(`unsupported filter ${col}=${raw}`), { status: 400, body: { code: 'PGRST100', message: `failed to parse filter (${raw})` } });
      const [, not, op, value] = m;
      const test = op === 'eq' ? (v) => String(v) === value
        : op === 'lt' ? (v) => v != null && String(v) < value
        : op === 'gt' ? (v) => v != null && String(v) > value
        : op === 'is' ? (v) => (value === 'null' ? v == null : String(v) === value)
        : (v) => value.replace(/^\(|\)$/g, '').split(',').includes(String(v));
      tests.push((row) => (not ? !test(row[col]) : test(row[col])));
    }
    return (row) => tests.every((t) => t(row));
  }
  const pick = (row, select) => (!select || select === '*' ? { ...row } : Object.fromEntries(select.split(',').map((c) => [c, row[c]])));
  function check(table, row) {
    const big = (v) => Buffer.byteLength(JSON.stringify(v ?? null));
    const bad = table === 'family_state'
      ? big(row.data) >= 400000 || String(row.player_device || '').length > 80
      : big(row.payload) >= 20000 || typeof row.type !== 'string' || row.type.length > 40 || String(row.device).length > 80 || String(row.outcome || '').length > 200 || !UUID.test(row.id);
    if (bad) throw Object.assign(new Error('check'), { status: 400, body: { code: '23514', message: `new row for relation "${table}" violates check constraint` } });
  }

  function rest(req, user, table, params, body) {
    const T = TABLES[table];
    if (!T) return [404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }];
    const mine = (row) => row.owner === user; // row level security
    const prefer = String(req.headers.prefer || '');
    const back = /return=representation/.test(prefer);
    const select = params.get('select');
    if (req.method === 'GET') {
      let out = db[table].filter(mine).filter(matcher(params));
      for (const part of (params.get('order') || '').split(',').filter(Boolean).reverse()) {
        const [col, dir] = part.split('.');
        out = out.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (params.get('limit')) out = out.slice(0, Number(params.get('limit')));
      return [200, out.map((r) => pick(r, select))];
    }
    if (req.method === 'POST') {
      const added = [];
      for (const given of Array.isArray(body) ? body : [body]) {
        const row = { ...T.fresh(), owner: user, ...given };
        if (table === 'commands') row.created_at = new Date(Date.now() + ++tick).toISOString();
        if (row.owner !== user) return [403, { code: '42501', message: `new row violates row-level security policy for table "${table}"` }];
        check(table, row);
        const at = db[table].findIndex((r) => r[T.key] === row[T.key]);
        if (at < 0) { db[table].push(row); added.push(row); }
        else if (/resolution=ignore-duplicates/.test(prefer)) continue;
        else if (/resolution=merge-duplicates/.test(prefer) && mine(db[table][at])) { Object.assign(db[table][at], given, table === 'family_state' ? { updated_at: new Date().toISOString() } : {}); added.push(db[table][at]); }
        else return [409, { code: '23505', message: 'duplicate key value violates unique constraint' }];
      }
      return back ? [201, added.map((r) => pick(r, select))] : [201, null];
    }
    if (req.method === 'PATCH') {
      const hit = db[table].filter(mine).filter(matcher(params));
      for (const row of hit) {
        const next = { ...row, ...body };
        if (next.owner !== user) return [403, { code: '42501', message: 'new row violates row-level security policy' }];
        check(table, next);
        Object.assign(row, body, table === 'family_state' ? { updated_at: new Date().toISOString() } : {});
      }
      return back ? [200, hit.map((r) => pick(r, select))] : [204, null];
    }
    if (req.method === 'DELETE') {
      const gone = new Set(db[table].filter(mine).filter(matcher(params)));
      db[table] = db[table].filter((r) => !gone.has(r));
      return [204, null];
    }
    return [405, { message: 'method not allowed' }];
  }

  // ---- the folder of pictures -----------------------------------------------
  const denied = [400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }];
  function storage(req, user, parts, body, bytes) {
    if (parts[0] === 'list' && parts[1] === 'photos' && req.method === 'POST') {
      const prefix = `${String(body?.prefix || '').replace(/\/$/, '')}/`;
      if (prefix !== `${user}/`) return [200, []]; // another family's folder looks empty
      return [200, [...db.objects].filter(([k]) => k.startsWith(prefix)).map(([k, o]) => ({ name: k.slice(prefix.length), id: o.id, created_at: o.created_at, updated_at: o.created_at, metadata: { size: o.bytes.length, mimetype: o.type } }))];
    }
    if (parts[0] === 'authenticated') parts = parts.slice(1);
    if (parts[0] !== 'photos') return [400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }];
    if (req.method === 'DELETE' && parts.length === 1) {
      const out = [];
      for (const k of body?.prefixes || []) if (k.startsWith(`${user}/`) && db.objects.delete(k)) out.push({ name: k, bucket_id: 'photos' });
      return [200, out];
    }
    const key = parts.slice(1).map(decodeURIComponent).join('/');
    const own = key.startsWith(`${user}/`) && key.split('/').length === 2;
    if (req.method === 'POST') {
      if (!own) return denied;
      const type = String(req.headers['content-type'] || '').split(';')[0];
      if (!MIME.includes(type)) return [400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` }];
      if (bytes.length > 3145728) return [400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }];
      if (db.objects.has(key) && req.headers['x-upsert'] !== 'true') return [400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }];
      const id = crypto.randomUUID();
      db.objects.set(key, { id, type, bytes, created_at: db.objects.get(key)?.created_at || new Date().toISOString() });
      return [200, { Key: `photos/${key}`, Id: id }];
    }
    if (req.method === 'GET') {
      const o = own ? db.objects.get(key) : null;
      return o ? [200, o.bytes, o.type] : [400, { statusCode: '404', error: 'not_found', message: 'Object not found' }];
    }
    return [405, { message: 'method not allowed' }];
  }

  // ---- the sign-in -----------------------------------------------------------
  function auth(req, path, params, body) {
    const fail = (status, error_code, msg) => [status, { code: status, error_code, msg }];
    if (path === 'signup' && req.method === 'POST') {
      const email = String(body?.email || '').toLowerCase();
      if (String(body?.password || '').length < 6) return fail(422, 'weak_password', 'Password should be at least 6 characters.');
      if (db.users.some((u) => u.email === email)) return fail(422, 'user_already_exists', 'User already registered');
      const user = { id: crypto.randomUUID(), email, password: body.password, confirmed: !confirm };
      db.users.push(user);
      return [200, confirm ? { id: user.id, email, aud: 'authenticated', role: 'authenticated', confirmation_sent_at: new Date().toISOString() } : session(user)];
    }
    if (path === 'token' && req.method === 'POST' && params.get('grant_type') === 'password') {
      const user = db.users.find((u) => u.email === String(body?.email || '').toLowerCase() && u.password === body?.password);
      if (!user) return fail(400, 'invalid_credentials', 'Invalid login credentials');
      if (!user.confirmed) return fail(400, 'email_not_confirmed', 'Email not confirmed');
      return [200, session(user)];
    }
    if (path === 'token' && req.method === 'POST' && params.get('grant_type') === 'refresh_token') {
      const id = refresh.get(body?.refresh_token);
      const user = db.users.find((u) => u.id === id);
      if (!user) return fail(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refresh.delete(body.refresh_token); // each one works once
      return [200, session(user)];
    }
    if (path === 'logout' && req.method === 'POST') return [204, null];
    return [404, { message: 'not found' }];
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Max-Age': '600' };
      const answer = ([status, body, type]) => {
        if (Buffer.isBuffer(body)) { res.writeHead(status, { ...cors, 'Content-Type': type }); return res.end(body); }
        res.writeHead(status, { ...cors, ...(body == null ? {} : { 'Content-Type': 'application/json' }) });
        res.end(body == null ? undefined : JSON.stringify(body));
      };
      if (down) return void req.socket.destroy();
      if (req.method === 'OPTIONS') return answer([204, null]);
      const url = new URL(req.url, 'http://x');
      const line = `${req.method} ${url.pathname}`;
      requests.push(line);
      if (failing && failing.test(line)) { failing = null; return answer([500, { message: 'the test asked for this failure' }]); }
      const bytes = Buffer.concat(chunks);
      const isJson = /json/.test(String(req.headers['content-type'] || ''));
      let body = null;
      try { body = isJson && bytes.length ? JSON.parse(bytes.toString('utf8')) : null; } catch { return answer([400, { message: 'bad json' }]); }
      try {
        if (!req.headers.apikey) return answer([401, { message: 'No API key found in request' }]);
        const seg = url.pathname.split('/').filter(Boolean); // e.g. ['rest', 'v1', 'commands']
        if (seg[0] === 'auth' && seg[1] === 'v1') return answer(auth(req, seg[2], url.searchParams, body));
        const known = tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        const user = known && !known.dead && db.users.some((u) => u.id === known.user) ? known.user : null;
        if (seg[0] === 'rest' && seg[1] === 'v1') {
          if (!user) return answer([401, { code: 'PGRST301', message: 'JWT expired' }]);
          if (seg[2] === 'rpc') {
            if (seg[3] !== 'delete_my_account') return answer([404, { code: 'PGRST202', message: 'Could not find the function in the schema cache' }]);
            db.users = db.users.filter((u) => u.id !== user); // the rows go with the account; the files do not (as in the real thing)
            for (const t of Object.keys(TABLES)) db[t] = db[t].filter((r) => r.owner !== user);
            return answer([204, null]);
          }
          return answer(rest(req, user, seg[2], url.searchParams, body));
        }
        if (seg[0] === 'storage' && seg[1] === 'v1' && seg[2] === 'object') {
          if (!user) return answer([400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' }]);
          return answer(storage(req, user, seg.slice(3), body, bytes));
        }
        return answer([404, { message: 'not found' }]);
      } catch (e) {
        return answer([e.status || 500, e.body || { message: String(e.message) }]);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      db,
      requests,
      expireTokens: () => { for (const t of tokens.values()) t.dead = true; },
      revoke: () => { for (const t of tokens.values()) t.dead = true; refresh.clear(); },
      setDown: (v) => { down = !!v; },
      setConfirm: (v) => { confirm = !!v; },
      confirmAll: () => { for (const u of db.users) u.confirmed = true; },
      failOnce: (re) => { failing = re; },
      close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
    }));
  });
}

module.exports = { startFamilyServer };
