// Endpoint PROTÉGÉ : login + CRUD. Rôles : "admin" (tout) / "editor" (intervenants seulement)
const { json, at, esc, isSlug, listAll, login, auth, T_CHANTIERS, T_INTERV } = require("./_lib");

const clean = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const url = (v) => { const s = clean(v, 500); return /^https?:\/\//i.test(s) ? s : ""; };
const ivFields = (b) => ({
  Slug: b.slug, Entreprise: clean(b.entreprise), Groupe: clean(b.groupe), Role: clean(b.role),
  Adresse: clean(b.adresse), Telephone: clean(b.telephone, 30), Email: clean(b.email),
  SiteWeb: url(b.siteWeb), LogoUrl: url(b.logo),
  Ordre: Number.isFinite(+b.ordre) ? +b.ordre : 999,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST uniquement" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON invalide" }); }

  try {
    if (b.action === "login") {
      await new Promise((r) => setTimeout(r, 400));
      const s = login(b.user, b.pass);
      return s ? json(200, s) : json(401, { error: "Identifiants incorrects" });
    }

    const me = auth(event);
    if (!me) return json(401, { error: "Session expirée" });
    const isAdmin = me.r === "admin";

    switch (b.action) {
      case "listChantiers": {
        const r = await listAll(T_CHANTIERS);
        return json(200, r.map((x) => ({ id: x.id, ...x.fields })));
      }
      case "saveChantier": {
        if (!isAdmin) return json(403, { error: "Réservé admin" });
        if (!isSlug(b.slug)) return json(400, { error: "Slug invalide (a-z, 0-9, tirets)" });
        const fields = {
          Slug: b.slug, Nom: clean(b.nom), Adresse: clean(b.adresse), Surface: clean(b.surface, 60),
          Usage: clean(b.usage, 120), ImageUrl: url(b.imageUrl), Description: clean(b.description, 3000),
          LienRejoindre: url(b.lienRejoindre), Horaires: clean(b.horaires, 500), Actif: !!b.actif,
        };
        // les dates vides ne doivent pas être envoyées (Airtable refuse "")
        if (/^\d{4}-\d{2}-\d{2}$/.test(b.dateDebut || "")) fields.DateDebut = b.dateDebut;
        if (/^\d{4}-\d{2}-\d{2}$/.test(b.dateFin || "")) fields.DateFin = b.dateFin;
        const out = b.id
          ? await at(T_CHANTIERS, { method: "PATCH", id: b.id, body: { fields } })
          : await at(T_CHANTIERS, { method: "POST", body: { fields } });
        return json(200, out);
      }
      case "listIntervenants": {
        if (!isSlug(b.slug)) return json(400, { error: "slug invalide" });
        const r = await listAll(T_INTERV, `{Slug}="${esc(b.slug)}"`);
        return json(200, r.map((x) => ({ id: x.id, ...x.fields })).sort((a, c) => (a.Ordre ?? 999) - (c.Ordre ?? 999)));
      }
      case "saveIntervenant": {
        if (!isSlug(b.slug)) return json(400, { error: "slug invalide" });
        if (!clean(b.entreprise)) return json(400, { error: "Entreprise obligatoire" });
        const fields = ivFields(b);
        const out = b.id
          ? await at(T_INTERV, { method: "PATCH", id: b.id, body: { fields } })
          : await at(T_INTERV, { method: "POST", body: { fields } });
        return json(200, out);
      }
      case "deleteIntervenant": {
        if (!/^rec[A-Za-z0-9]{10,}$/.test(b.id || "")) return json(400, { error: "id invalide" });
        await at(T_INTERV, { method: "DELETE", id: b.id });
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
