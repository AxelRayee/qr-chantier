// Sert les images envoyées depuis l'admin : /img/<slug>/<id>.jpg|png (public, comme la page du chantier)
const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const k = (event.queryStringParameters || {}).k || "";
  if (!/^[a-z0-9-]{2,60}\/[a-f0-9]{16}\.(jpg|png)$/.test(k)) return { statusCode: 404, body: "Introuvable" };
  try {
    connectLambda(event);
    const data = await getStore("images").get(k, { type: "arrayBuffer" });
    if (!data) return { statusCode: 404, body: "Introuvable" };
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
    return { statusCode: 500, body: "Erreur serveur" };
  }
};
