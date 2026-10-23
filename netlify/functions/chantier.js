// Endpoint PUBLIC (lecture seule) : /.netlify/functions/chantier?slug=xxx
const { json, esc, isSlug, listAll, T_CHANTIERS, T_INTERV } = require("./_lib");

exports.handler = async (event) => {
  const slug = (event.queryStringParameters || {}).slug;
  if (!isSlug(slug)) return json(400, { error: "slug invalide" });
  try {
    const ch = await listAll(T_CHANTIERS, `AND({Slug}="${esc(slug)}",{Actif})`);
    if (!ch.length) return json(404, { error: "Chantier introuvable" });
    const f = ch[0].fields;
    const iv = await listAll(T_INTERV, `{Slug}="${esc(slug)}"`);
    const intervenants = iv
      .map((r) => r.fields)
      .sort((a, b) => (a.Ordre ?? 999) - (b.Ordre ?? 999))
      .map((x) => ({
        groupe: x.Groupe || "Autres intervenants", entreprise: x.Entreprise || "", role: x.Role || "",
        adresse: x.Adresse || "", telephone: x.Telephone || "", email: x.Email || "",
        siteWeb: x.SiteWeb || "", logo: x.LogoUrl || "",
      }));
    return json(200, {
      nom: f.Nom || "", adresse: f.Adresse || "", surface: f.Surface || "", usage: f.Usage || "",
      imageUrl: f.ImageUrl || "", description: f.Description || "", lienRejoindre: f.LienRejoindre || "",
      dateDebut: f.DateDebut || "", dateFin: f.DateFin || "", horaires: f.Horaires || "",
      intervenants,
    }, { "Cache-Control": "public, max-age=60" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur serveur" });
  }
};
