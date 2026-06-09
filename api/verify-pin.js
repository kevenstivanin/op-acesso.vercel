// Rate limiting para tentativas de PIN
const pinAttempts = {};
const PIN_LIMIT = 5;
const PIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

function checkPinLimit(ip) {
  const now = Date.now();
  if (!pinAttempts[ip] || now - pinAttempts[ip].start > PIN_WINDOW_MS) {
    pinAttempts[ip] = { count: 1, start: now };
    return { ok: true };
  }
  if (pinAttempts[ip].count >= PIN_LIMIT) {
    const restante = Math.ceil((PIN_WINDOW_MS - (now - pinAttempts[ip].start)) / 1000);
    return { ok: false, restante };
  }
  pinAttempts[ip].count++;
  return { ok: true };
}

export default function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const limit = checkPinLimit(ip);
  if (!limit.ok) {
    return res.status(429).json({ error: `Muitas tentativas. Aguarde ${limit.restante} segundos.` });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pin, tipo } = req.body || {};
  if (!pin || !tipo) return res.status(400).json({ error: "Dados insuficientes" });

  const pinCorreto = tipo === "admin"
    ? process.env.ADMIN_PIN
    : process.env.APP_PIN;

  if (pin === pinCorreto) {
    // Limpa tentativas em caso de sucesso
    delete pinAttempts[ip];
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: "PIN incorreto" });
}
