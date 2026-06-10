const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

const attempts = {};
const LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!attempts[ip] || now - attempts[ip].start > WINDOW_MS) {
    attempts[ip] = { count: 1, start: now };
    return true;
  }
  if (attempts[ip].count >= LIMIT) return false;
  attempts[ip].count++;
  return true;
}

module.exports = function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const ip = req.headers["x-forwarded-for"] || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Muitas tentativas. Aguarde 1 minuto." });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { encrypted, adminPin } = req.body || {};
  if (!encrypted || !adminPin) return res.status(400).json({ error: "Dados insuficientes" });
  if (adminPin !== process.env.ADMIN_PIN) return res.status(401).json({ error: "PIN de administrador incorreto" });

  try {
    const key = Buffer.from((process.env.CPF_ENCRYPTION_KEY || "GREMIO_SECURE_KEY_2024_LGPD!!!!!").slice(0, 32));
    const buf = Buffer.from(encrypted, "base64");
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const data = buf.slice(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return res.status(200).json({ cpf: decrypted.toString("utf8") });
  } catch (e) {
    return res.status(500).json({ error: "Erro na descriptografia: " + e.message });
  }
};
