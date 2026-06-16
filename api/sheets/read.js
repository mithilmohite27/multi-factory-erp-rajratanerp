import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, sendError } from "../_lib/http.js";
import { readSheetRows } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["GET"]);
    await requireAdmin(req);
    const rows = await readSheetRows(req.query.sheetName);
    res.status(200).json({ ok: true, rows });
  } catch (error) {
    sendError(res, error);
  }
}
