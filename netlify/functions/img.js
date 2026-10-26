// Sert les images envoyées depuis l'admin : /img/<slug>/<id>.jpg|png (public, comme la page du chantier)
const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const OK = /^[a-z0-9-]{2,60}\/[a-f0-9]{16}\.(jpg|png)$/;
  const TXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  let k = String((event.queryStringParameters || {}).k || "");
  if (!OK.test(k)) { // repli : clé lue dans l'adresse d'origine (/img/<slug>/<id>.jpg)
    const m = String(event.rawUrl || event.path || "").match(/\/img\/([a-z0-9-]{2,60}\/[a-f0-9]{16}\.(?:jpg|png))/);
    if (m) k = m[1];
  }
  if (!OK.test(k)) return { statusCode: 404, headers: TXT, body: "Adresse d'image invalide : " + k.slice(0, 80) };
  try {
    connectLambda(event);
    const data = await getStore("images").get(k, { type: "arrayBuffer" });
    if (!data) return { statusCode: 404, headers: TXT, body: "Image absente du stockage : " + k };
    return {
      statusCode: 200,
      headers: {
        "Content-Type": k.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable", // chaque envoi a un nom unique
        "X-Content-Type-Options": "nosniff",
      },
      body: Buffer.from(data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: "Erreur stockage images : " + String((e && e.message) || e).slice(0, 200) };
  }
};
