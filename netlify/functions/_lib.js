const crypto = require("crypto");

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const T_CHANTIERS = process.env.AIRTABLE_TABLE_CHANTIERS || "Chantiers";
const T_INTERV = process.env.AIRTABLE_TABLE_INTERVENANTS || "Intervenants";

const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  body: JSON.stringify(body),
});

async function at(table, { method = "GET", id = "", query = "", body } = {}) {
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}${id ? "/" + id : ""}${query}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${data?.error?.message || data?.error || "erreur"}`);
  return data;
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const isSlug = (s) => typeof s === "string" && /^[a-z0-9-]{2,60}$/.test(s);

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

// ---------- Auth (token HMAC signé, 12h) ----------
const SECRET = process.env.AUTH_SECRET || "";
const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("base64url");

function users() {
  try { return JSON.parse(process.env.ADMIN_USERS || "{}"); } catch { return {}; }
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function login(user, pass) {
  const u = users()[user];
  if (!SECRET || !u || !safeEq(u.pass, pass || "")) return null;
  const payload = b64(JSON.stringify({ u: user, r: u.role || "editor", exp: Date.now() + 12 * 3600e3 }));
  return { token: `${payload}.${sign(payload)}`, role: u.role || "editor", user };
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

module.exports = { json, at, esc, isSlug, listAll, login, auth, T_CHANTIERS, T_INTERV };
