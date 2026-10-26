// Endpoint PROTÉGÉ. Rôles :
//  - admin   : tout (créer chantiers, inviter, gérer les comptes)
//  - manager : gestionnaire invité, UNIQUEMENT sur son chantier (infos + intervenants)
//  - editor  : ancien rôle global défini dans ADMIN_USERS (intervenants de tous les chantiers)
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");
const {
  json, at, esc, isSlug, sha256, listAll, login, auth, checkManager,
  T_CHANTIERS, T_INTERV, T_USERS, T_INVITES,
} = require("./_lib");

const clean = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const url = (v) => { const s = clean(v, 500); return /^https?:\/\//i.test(s) ? s : ""; };
// URL d'image : lien https externe OU image envoyée via l'admin (/img/<slug>/<id>.jpg|png)
const imgUrl = (v) => {
  const s = clean(v, 500);
  return /^https?:\/\//i.test(s) || /^\/img\/[a-z0-9-]{2,60}\/[a-f0-9]{16}\.(jpg|png)$/.test(s) ? s : "";
};
const isRec = (id) => /^rec[A-Za-z0-9]{10,}$/.test(id || "");
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const ADMIN_ONLY = new Set(["createInvite", "listInvites", "revokeInvite", "listUsers", "setUserActif", "deleteUser", "deleteChantier"]);

const chFields = (b) => ({
  Nom: clean(b.nom), Adresse: clean(b.adresse), Surface: clean(b.surface, 60), Usage: clean(b.usage, 120),
  ImageUrl: imgUrl(b.imageUrl), Description: clean(b.description, 3000), LienRejoindre: url(b.lienRejoindre),
  Horaires: clean(b.horaires, 500),
  DateDebut: isDate(b.dateDebut) ? b.dateDebut : null,
  DateFin: isDate(b.dateFin) ? b.dateFin : null,
});
const ivFields = (b, slug) => ({
  Slug: slug, Entreprise: clean(b.entreprise), Groupe: clean(b.groupe), Role: clean(b.role),
  Adresse: clean(b.adresse), Telephone: clean(b.telephone, 30), Email: clean(b.email),
  SiteWeb: url(b.siteWeb), LogoUrl: imgUrl(b.logo),
  Ordre: Number.isFinite(+b.ordre) ? +b.ordre : 999,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST uniquement" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON invalide" }); }

  try {
    if (b.action === "login") {
      await new Promise((r) => setTimeout(r, 400));
      const s = await login(b.user, b.pass);
      return s ? json(200, s) : json(401, { error: "Identifiants incorrects, ou compte désactivé / verrouillé 15 min" });
    }

    const me = auth(event);
    if (!me) return json(401, { error: "Session expirée" });
    const isAdmin = me.r === "admin";
    const isManager = me.r === "manager";
    if (isManager && !(await checkManager(me))) return json(403, { error: "Accès désactivé ou expiré" });
    if (ADMIN_ONLY.has(b.action) && !isAdmin) return json(403, { error: "Réservé admin" });

    // Un gestionnaire est TOUJOURS cantonné à son chantier, quoi que le navigateur envoie
    const slug = isManager ? me.s : b.slug;

    switch (b.action) {
      case "listChantiers": {
        const r = await listAll(T_CHANTIERS, isManager ? `{Slug}="${esc(me.s)}"` : undefined);
        return json(200, r.map((x) => ({ id: x.id, ...x.fields })));
      }

      case "saveChantier": {
        if (isManager) {
          const r = (await listAll(T_CHANTIERS, `{Slug}="${esc(me.s)}"`))[0];
          if (!r) return json(404, { error: "Chantier introuvable" });
          // le gestionnaire ne peut changer ni le slug ni l'état Actif
          const out = await at(T_CHANTIERS, { method: "PATCH", id: r.id, body: { fields: chFields(b) } });
          return json(200, out);
        }
        if (!isAdmin) return json(403, { error: "Réservé admin" });
        if (!isSlug(b.slug)) return json(400, { error: "Slug invalide (a-z, 0-9, tirets)" });
        const fields = { ...chFields(b), Slug: b.slug, Actif: !!b.actif };
        const out = b.id
          ? await at(T_CHANTIERS, { method: "PATCH", id: b.id, body: { fields } })
          : await at(T_CHANTIERS, { method: "POST", body: { fields } });
        return json(200, out);
      }

      case "listIntervenants": {
        if (!isSlug(slug)) return json(400, { error: "slug invalide" });
        const r = await listAll(T_INTERV, `{Slug}="${esc(slug)}"`);
        return json(200, r.map((x) => ({ id: x.id, ...x.fields })).sort((a, c) => (a.Ordre ?? 999) - (c.Ordre ?? 999)));
      }

      case "saveIntervenant": {
        if (!isSlug(slug)) return json(400, { error: "slug invalide" });
        if (!clean(b.entreprise)) return json(400, { error: "Entreprise obligatoire" });
        if (b.id) {
          if (!isRec(b.id)) return json(400, { error: "id invalide" });
          const cur = await at(T_INTERV, { id: b.id });
          if (cur.fields.Slug !== slug) return json(403, { error: "Cet intervenant n'appartient pas à ce chantier" });
        }
        const fields = ivFields(b, slug);
        const out = b.id
          ? await at(T_INTERV, { method: "PATCH", id: b.id, body: { fields } })
          : await at(T_INTERV, { method: "POST", body: { fields } });
        return json(200, out);
      }

      case "deleteIntervenant": {
        if (!isRec(b.id)) return json(400, { error: "id invalide" });
        if (isManager) {
          const cur = await at(T_INTERV, { id: b.id });
          if (cur.fields.Slug !== me.s) return json(403, { error: "Cet intervenant n'appartient pas à ce chantier" });
        }
        await at(T_INTERV, { method: "DELETE", id: b.id });
        return json(200, { ok: true });
      }

      // ----- Envoi d'une image (stockée dans Netlify Blobs, servie par /img/...) -----
      case "uploadImage": {
        if (!isSlug(slug)) return json(400, { error: "Renseigne d'abord le chantier (slug)" });
        const ext = b.type === "image/png" ? "png" : b.type === "image/jpeg" ? "jpg" : null;
        if (!ext) return json(400, { error: "Format accepté : JPEG ou PNG" });
        const buf = Buffer.from(String(b.data || ""), "base64");
        if (!buf.length || buf.length > 2 * 1024 * 1024) return json(400, { error: "Image trop lourde (2 Mo maximum)" });
        const okMagic = ext === "jpg"
          ? buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
          : buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        if (!okMagic) return json(400, { error: "Fichier image invalide" });
        connectLambda(event);
        const key = `${slug}/${crypto.randomBytes(8).toString("hex")}.${ext}`;
        await getStore("images").set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        return json(200, { url: "/img/" + key });
      }

      // ----- Admin : invitations et comptes -----
      case "createInvite": {
        if (!isSlug(b.slug)) return json(400, { error: "slug invalide" });
        const ch = await listAll(T_CHANTIERS, `{Slug}="${esc(b.slug)}"`);
        if (!ch.length) return json(404, { error: "Chantier introuvable" });
        const email = clean(b.email, 120).toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "E-mail invalide" });
        const days = Math.min(60, Math.max(1, Math.round(+b.days || 14)));
        const token = crypto.randomBytes(24).toString("base64url"); // montré UNE seule fois, jamais stocké en clair
        const expire = Date.now() + days * 864e5;
        const fields = {
          Jeton: sha256(token), Slug: b.slug, Note: clean(b.note, 80), Expire: expire,
          Utilisee: false, Revoquee: false,
        };
        if (email) fields.EmailInvite = email;
        await at(T_INVITES, { method: "POST", body: { fields } });
        return json(200, { token, expire });
      }

      case "listInvites": {
        if (!isSlug(b.slug)) return json(400, { error: "slug invalide" });
        const r = await listAll(T_INVITES, `{Slug}="${esc(b.slug)}"`);
        return json(200, r.map((x) => ({
          id: x.id, note: x.fields.Note || "", email: x.fields.EmailInvite || "", expire: x.fields.Expire || 0,
          utilisee: !!x.fields.Utilisee, utilisePar: x.fields.UtilisePar || "", revoquee: !!x.fields.Revoquee,
        })));
      }

      case "revokeInvite": {
        if (!isRec(b.id)) return json(400, { error: "id invalide" });
        await at(T_INVITES, { method: "PATCH", id: b.id, body: { fields: { Revoquee: true } } });
        return json(200, { ok: true });
      }

      case "listUsers": {
        if (!isSlug(b.slug)) return json(400, { error: "slug invalide" });
        const r = await listAll(T_USERS, `{Slug}="${esc(b.slug)}"`);
        return json(200, r.map((x) => ({
          id: x.id, identifiant: x.fields.Identifiant || "", email: x.fields.Email || "",
          actif: !!x.fields.Actif, expire: x.fields.Expire || "",
        })));
      }

      case "setUserActif": {
        if (!isRec(b.id)) return json(400, { error: "id invalide" });
        await at(T_USERS, { method: "PATCH", id: b.id, body: { fields: { Actif: !!b.actif } } });
        return json(200, { ok: true });
      }

      case "deleteUser": {
        if (!isRec(b.id)) return json(400, { error: "id invalide" });
        await at(T_USERS, { method: "DELETE", id: b.id });
        return json(200, { ok: true });
      }

      // ----- Admin : suppression complète d'un chantier (fiche, intervenants, invitations, comptes gestionnaires, images) -----
      case "deleteChantier": {
        if (!isRec(b.id)) return json(400, { error: "id invalide" });
        const ch = await at(T_CHANTIERS, { id: b.id });
        const sl = ch.fields && ch.fields.Slug;
        if (!isSlug(sl)) return json(400, { error: "Chantier invalide" });
        const q = `{Slug}="${esc(sl)}"`;
        for (const T of [T_INTERV, T_INVITES, T_USERS]) {
          for (const r of await listAll(T, q)) await at(T, { method: "DELETE", id: r.id });
        }
        await at(T_CHANTIERS, { method: "DELETE", id: b.id });
        try { // images : échec non bloquant
          connectLambda(event);
          const st = getStore("images");
          const { blobs } = await st.list({ prefix: sl + "/" });
          for (const x of blobs) await st.delete(x.key);
        } catch (e) { console.error("purge images", e); }
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: "action inconnue" });
    }
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur serveur" });
  }
};
