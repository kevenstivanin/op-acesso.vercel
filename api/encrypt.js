const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_STR = process.env.CPF_ENCRYPTION_KEY || "GREMIO_SECURE_KEY_2024_LGPD!!!!!";
const KEY = Buffer.from(KEY_STR.padEnd(32).slice(0, 32));

module.exports = function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { cpf } = req.body || {};
  if (!cpf) return res.status(400).json({ error: "CPF nao informado" });

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(cpf, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const result = Buffer.concat([iv, tag, encrypted]).toString("base64");
    return res.status(200).json({ encrypted: result });
  } catch (e) {
    return res.status(500).json({ error: "Erro na criptografia: " + e.message });
  }
};
