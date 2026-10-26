const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const T_CHANTIERS = process.env.AIRTABLE_TABLE_CHANTIERS || "Chantiers";
const T_INTERV = process.env.AIRTABLE_TABLE_INTERVENANTS || "Intervenants";
const T_USERS = process.env.AIRTABLE_TABLE_UTILISATEURS || "Utilisateurs";
const T_INVITES = process.env.AIRTABLE_TABLE_INVITATIONS || "Invitations";

const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  body: JSON.stringify(body),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function at(table, { method = "GET", id = "", query = "", body } = {}) {
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}${id ? "/" + id : ""}${query}`;
  for (let essai = 0; ; essai++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Airtable limite à 5 requêtes/s : on réessaie quand il dit « trop vite » (429) ou en cas d'erreur serveur
    if ((res.status === 429 || res.status >= 500) && essai < 3) { await sleep(300 * (essai + 1) ** 2); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${data?.error?.message || data?.error || "erreur"}`);
    return data;
  }
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const isSlug = (s) => typeof s === "string" && /^[a-z0-9-]{2,60}$/.test(s);
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function listAll(table, formula) {
  let out = [], offset = "";
  do {
    const q = `?pageSize=100${formula ? "&filterByFormula=" + encodeURIComponent(formula) : ""}${offset ? "&offset=" + offset : ""}`;
    const d = await at(table, { query: q });
    out = out.concat(d.records);
    offset = d.offset || "";
  } while (offset);
  return out;
}

// ---------- Mots de passe (scrypt + sel aléatoire) ----------
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return { Sel: salt.toString("hex"), Hash: key.toString("hex") };
}
async function verifyPassword(pw, selHex, hashHex) {
  if (!selHex || !hashHex) return false;
  const key = await scrypt(pw, Buffer.from(selHex, "hex"), 64);
  const ref = Buffer.from(hashHex, "hex");
  return key.length === ref.length && crypto.timingSafeEqual(key, ref);
}
const DUMMY_SALT = crypto.randomBytes(16); // pour égaliser le temps de réponse si le compte n'existe pas

// ---------- Sessions (token HMAC signé, 12h) ----------
const SECRET = process.env.AUTH_SECRET || "";
const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("base64url");

// Comptes "fixes" définis dans Netlify (ADMIN_USERS) : réservés à l'admin
function users() {
  try {
    const o = JSON.parse(process.env.ADMIN_USERS || "{}"), m = {};
    for (const k in o) m[k.toLowerCase()] = o[k];
    return m;
  } catch { return {}; }
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function mint(p) {
  const payload = b64(JSON.stringify({ ...p, exp: Date.now() + 12 * 3600e3 }));
  return { token: `${payload}.${sign(payload)}`, role: p.r, user: p.u, slug: p.s || null };
}

async function login(userIn, passIn) {
  if (!SECRET) return null;
  const user = String(userIn || "").trim().toLowerCase().slice(0, 60);
  const pass = String(passIn || "").slice(0, 200);
  if (!user) return null;

  const env = users()[user];
  if (env) return safeEq(env.pass, pass) ? mint({ u: user, r: env.role || "editor" }) : null;

  // Compte gestionnaire (Airtable) : 5 échecs => verrouillage 15 min
  const rec = (await listAll(T_USERS, `LOWER({Identifiant})="${esc(user)}"`))[0];
  if (!rec) { await scrypt(pass, DUMMY_SALT, 64); return null; }
  const f = rec.fields;
  if (!f.Actif || (f.VerrouJusqua || 0) > Date.now()) { await scrypt(pass, DUMMY_SALT, 64); return null; }
  if (!(await verifyPassword(pass, f.Sel, f.Hash))) {
    const n = (f.Echecs || 0) + 1;
    await at(T_USERS, {
      method: "PATCH", id: rec.id,
      body: { fields: n >= 5 ? { Echecs: 0, VerrouJusqua: Date.now() + 15 * 60e3 } : { Echecs: n } },
    });
    return null;
  }
  if (f.Echecs) await at(T_USERS, { method: "PATCH", id: rec.id, body: { fields: { Echecs: 0 } } });
  return mint({ u: f.Identifiant, r: "manager", s: f.Slug, uid: rec.id });
}

function auth(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const t = h.replace(/^Bearer /, "");
  const [p, s] = t.split(".");
  if (!p || !s || !SECRET || !safeEq(sign(p), s)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}

// Revérifié à CHAQUE requête d'un gestionnaire : compte actif, non expiré, chantier non terminé depuis > 30 jours
async function checkManager(me) {
  try {
    const f = (await at(T_USERS, { id: me.uid })).fields;
    const today = new Date().toISOString().slice(0, 10);
    if (!f.Actif || f.Slug !== me.s || (f.Expire && f.Expire < today)) return false;
    const ch = await listAll(T_CHANTIERS, `{Slug}="${esc(me.s)}"`);
    if (!ch.length) return false;
    const fin = ch[0].fields.DateFin;
    if (fin) {
      const lim = new Date(fin);
      lim.setDate(lim.getDate() + 30);
      if (lim.toISOString().slice(0, 10) < today) return false;
    }
    return true;
  } catch { return false; }
}

module.exports = {
  json, at, esc, isSlug, sha256, listAll, users, hashPassword, login, auth, checkManager,
  T_CHANTIERS, T_INTERV, T_USERS, T_INVITES,
};
