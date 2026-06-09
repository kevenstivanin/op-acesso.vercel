import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { adminPin, lider, totalRegistros } = req.body || {};
  if (adminPin !== process.env.ADMIN_PIN) return res.status(401).json({ error: "Não autorizado" });

  try {
    await supabase.from("export_logs").insert([{
      lider: lider || "desconhecido",
      total_registros: totalRegistros || 0,
      ip: req.headers["x-forwarded-for"] || "unknown",
      exportado_em: new Date().toISOString(),
    }]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Erro ao registrar log" });
  }
}
