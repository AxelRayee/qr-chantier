// Endpoint PUBLIC : mot de passe oublié, identifiant oublié, réinitialisation par lien.
// forgot   {q}          : q = identifiant ou e-mail -> lien de réinitialisation (par e-mail si configuré, sinon demande à l'admin)
// forgotId {email}      : rappel des identifiants (par e-mail si configuré, sinon demande à l'admin)
// check    {t}          : vérifie un lien de réinitialisation, renvoie l'identifiant
// reset    {t,password} : change le mot de passe (lien à usage unique), déconnecte les anciennes sessions
// Les réponses de forgot / forgotId sont identiques que le compte existe ou non (pas d'énumération).
const { json, at, esc, sha256, listAll, hashPassword, siteUrl, mailOn, sendMail, newToken, isToken, T_USERS } = require("./_lib");

const BAD = { error: "Lien invalide, expiré ou déjà utilisé" };
const PAUSE = 2 * 60e3; // au plus une demande toutes les 2 min par compte (anti-spam)
const isMail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const actifs = (r) => r.filter((x) => x.fields.Actif && x.fields.Role === "manager");

async function trouver(q) {
  if (isMail(q)) return actifs(await listAll(T_USERS, `LOWER({Email})="${esc(q)}"`));
  if (/^[a-z0-9._-]{3,30}$/.test(q)) return actifs(await listAll(T_USERS, `LOWER({Identifiant})="${esc(q)}"`));
  return [];
}
// Délai aléatoire : la réponse met le même temps que le compte existe ou non
const generique = async (t0) => {
  await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0)) + Math.random() * 200));
  return json(200, { ok: true, mode: mailOn() ? "email" : "admin" });
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST uniquement" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON invalide" }); }

  try {
    if (b.action === "forgot" || b.action === "forgotId") {
      const q = String(b.q || b.email || "").trim().toLowerCase().slice(0, 120);
      if (b.action === "forgotId" && !isMail(q)) return json(400, { error: "Indique ton adresse e-mail" });
      if (!q) return json(400, { error: "Indique ton identifiant ou ton e-mail" });
      const now = Date.now(), t0 = now;
      for (const u of (await trouver(q)).slice(0, 5)) {
        const f = u.fields;
        if (now - (f.ResetDemande || 0) < PAUSE) continue;
        const fields = { ResetDemande: now };
        let mail = null;
        if (mailOn() && f.Email) {
          if (b.action === "forgot") {
            const token = newToken();
            Object.assign(fields, { ResetHash: sha256(token), ResetExpire: now + 3600e3 });
            mail = ["Réinitialisation de ton mot de passe",
              `Bonjour,\n\nUne demande de nouveau mot de passe a été faite pour ton accès « ${f.Identifiant} » au panneau de chantier Groupe Legendre.\n\n` +
              `Pour choisir un nouveau mot de passe (lien valable 1 heure, utilisable une seule fois) :\n${siteUrl()}/reinit.html?t=${token}\n\n` +
              `Si tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe actuel reste valable.`];
          } else {
            mail = ["Ton identifiant",
              `Bonjour,\n\nTon identifiant pour le panneau de chantier Groupe Legendre est : ${f.Identifiant}\n\n` +
              `Pour te connecter : ${siteUrl()}/admin.html\n\nSi tu n'es pas à l'origine de cette demande, ignore ce message.`];
          }
        }
        await at(T_USERS, { method: "PATCH", id: u.id, body: { fields } });
        if (mail) { try { await sendMail(f.Email, mail[0], mail[1]); } catch (e) { console.error(e); } }
      }
      return generique(t0);
    }

    if (b.action === "check" || b.action === "reset") {
      const t = String(b.t || "");
      if (!isToken(t)) return json(404, BAD);
      const u = (await listAll(T_USERS, `{ResetHash}="${sha256(t)}"`))[0];
      const f = u && u.fields;
      if (!f || !f.Actif || f.Role !== "manager" || !((f.ResetExpire || 0) > Date.now())) return json(404, BAD);
      if (b.action === "check") return json(200, { identifiant: f.Identifiant });

      const pw = String(b.password || "");
      if (pw.length < 12 || pw.length > 200) return json(400, { error: "Mot de passe : 12 caractères minimum" });
      const { Sel, Hash } = await hashPassword(pw);
      await at(T_USERS, {
        method: "PATCH", id: u.id,
        body: { fields: { Sel, Hash, ResetHash: "", ResetExpire: 0, ResetDemande: 0, Echecs: 0, VerrouJusqua: 0, Version: (f.Version || 0) + 1 } },
      });
      return json(200, { ok: true, identifiant: f.Identifiant });
    }

    return json(400, { error: "action inconnue" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur serveur" });
  }
};
