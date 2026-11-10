// Fonction PLANIFIÉE (voir netlify.toml) : le 1er de chaque mois, envoie un petit bilan par e-mail.
// But principal : utiliser la clé Brevo au moins une fois par mois, sinon Brevo la supprime après 90 jours sans activité.
// Destinataire : ALERT_EMAIL, sinon MAIL_FROM. Ne peut pas être appelée depuis le web (fonction planifiée).
const { at, listAll, mailOn, sendMail, siteUrl, T_CHANTIERS, T_USERS } = require("./_lib");

async function bilan() {
  const [ch, us] = await Promise.all([listAll(T_CHANTIERS), listAll(T_USERS)]);
  const today = new Date().toISOString().slice(0, 10);
  const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const actifs = ch.filter((c) => c.fields.Actif);
  const finProche = actifs.filter((c) => c.fields.DateFin && c.fields.DateFin >= today && c.fields.DateFin <= dans30);
  const termines = actifs.filter((c) => c.fields.DateFin && c.fields.DateFin < today);
  const aide = us.filter((u) => u.fields.Actif && (u.fields.ResetDemande || 0) > 0);
  const lignes = [
    `Chantiers en ligne : ${actifs.length}`,
    `Comptes gestionnaires actifs : ${us.filter((u) => u.fields.Actif).length}`,
    finProche.length ? `Fin prévue dans moins de 30 jours : ${finProche.map((c) => c.fields.Nom || c.fields.Slug).join(", ")}` : "",
    termines.length ? `Terminés mais encore en ligne (à désactiver ?) : ${termines.map((c) => c.fields.Nom || c.fields.Slug).join(", ")}` : "",
    aide.length ? `Demandes d'aide en attente (mot de passe / identifiant) : ${aide.map((u) => u.fields.Identifiant).join(", ")}` : "",
  ].filter(Boolean);
  return lignes.join("\n");
}

async function envoyer(objet) {
  const to = process.env.ALERT_EMAIL || process.env.MAIL_FROM;
  await sendMail(to, objet,
    `Bonjour,\n\nBilan mensuel du panneau de chantier Groupe Legendre :\n\n${await bilan()}\n\n` +
    `Administration : ${siteUrl()}/admin.html\n\n` +
    `Ce message prouve aussi que l'envoi d'e-mails fonctionne. S'il n'arrive pas en début de mois, vérifie la clé Brevo (Brevo supprime une clé inutilisée pendant 90 jours).`);
  return to;
}

exports.handler = async () => {
  if (!mailOn()) { console.log("veille : e-mails non configurés"); return { statusCode: 200 }; }
  try { const to = await envoyer("Bilan mensuel · Panneau de chantier"); console.log("veille : bilan envoyé à", to); }
  catch (e) { console.error("veille : ÉCHEC envoi", e); return { statusCode: 500 }; }
  return { statusCode: 200 };
};
exports.envoyer = envoyer;
