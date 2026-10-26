// Endpoint PUBLIC mais protégé par un jeton d'invitation à usage unique.
// info     : vérifie le lien et renvoie le nom du chantier
// register : crée le compte du gestionnaire (identifiant + e-mail + mot de passe)
const { json, at, esc, sha256, listAll, users, hashPassword, T_CHANTIERS, T_USERS, T_INVITES } = require("./_lib");

const BAD = { error: "Lien invalide, expiré ou déjà utilisé" };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST uniquement" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON invalide" }); }

  try {
    const tok = String(b.t || "");
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(tok)) return json(404, BAD);

    const inv = (await listAll(T_INVITES, `{Jeton}="${sha256(tok)}"`))[0];
    const f = inv && inv.fields;
    if (!f || f.Utilisee || f.Revoquee || !(f.Expire > Date.now())) return json(404, BAD);

    const ch = (await listAll(T_CHANTIERS, `{Slug}="${esc(f.Slug)}"`))[0];
    if (!ch) return json(404, BAD);

    if (b.action === "info") {
      return json(200, { chantier: ch.fields.Nom || f.Slug, emailImpose: !!f.EmailInvite });
    }

    if (b.action === "register") {
      const ident = String(b.identifiant || "").trim().toLowerCase();
      const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
      const pw = String(b.password || "");
      if (!/^[a-z0-9._-]{3,30}$/.test(ident)) return json(400, { error: "Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)" });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "E-mail invalide" });
      if (pw.length < 12 || pw.length > 200) return json(400, { error: "Mot de passe : 12 caractères minimum" });
      if (f.EmailInvite && f.EmailInvite.toLowerCase() !== email) {
        return json(400, { error: "Cette invitation est réservée à une autre adresse e-mail" });
      }
      if (users()[ident] || (await listAll(T_USERS, `LOWER({Identifiant})="${esc(ident)}"`)).length) {
        return json(409, { error: "Cet identifiant est déjà pris" });
      }

      // On "brûle" l'invitation d'abord ; on la rend si la création du compte échoue
      await at(T_INVITES, { method: "PATCH", id: inv.id, body: { fields: { Utilisee: true, UtilisePar: ident } } });
      try {
        const { Sel, Hash } = await hashPassword(pw);
        await at(T_USERS, {
          method: "POST",
          body: { fields: { Identifiant: ident, Email: email, Slug: f.Slug, Role: "manager", Sel, Hash, Actif: true, Echecs: 0, VerrouJusqua: 0 } },
        });
      } catch (e) {
        await at(T_INVITES, { method: "PATCH", id: inv.id, body: { fields: { Utilisee: false, UtilisePar: "" } } }).catch(() => {});
        throw e;
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "action inconnue" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur serveur" });
  }
};
