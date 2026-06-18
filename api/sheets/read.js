import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, sendError } from "../_lib/http.js";
import { readSheetRows } from "../_lib/sheetsService.js";
import { scopeRowsForUser } from "../_lib/factoryAccess.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["GET"]);
    const user = await requireAdmin(req);
    const rows = await readSheetRows(req.query.sheetName);
    res.status(200).json({ ok: true, rows: scopeRowsForUser(user, rows) });
  } catch (error) {
    sendError(res, error);
  }
}
