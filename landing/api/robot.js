// /api/robot : appelé chaque matin par Vercel Cron (Authorization: Bearer CRON_SECRET) ou par le bouton du CRM.

import { runRobot } from "./_robot.js";
import { isAdmin, safeEqual, send } from "./_lib.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret) && safeEqual(req.headers.authorization ?? "", `Bearer ${secret}`);
  if (!fromCron && !isAdmin(req)) return send(res, 401, { error: "Non autorisé" });
  try {
    send(res, 200, await runRobot());
  } catch (err) {
    console.error("robot failed:", err.message);
    send(res, 500, { error: err.message });
  }
}
