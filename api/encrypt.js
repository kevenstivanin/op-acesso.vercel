const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from((process.env.CPF_ENCRYPTION_KEY || "").padEnd(32).slice(0, 32));

export default function handler(req, res) {
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { cpf, pin } = req.body || {};
  if (!cpf || !pin) return res.status(400).json({ error: "Dados insuficientes" });
  if (pin !== process.env.APP_PIN) return res.status(401).json({ error: "Não autorizado" });

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(cpf, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const result = Buffer.concat([iv, tag, encrypted]).toString("base64");
    return res.status(200).json({ encrypted: result });
  } catch (e) {
    return res.status(500).json({ error: "Erro na criptografia" });
  }
}
