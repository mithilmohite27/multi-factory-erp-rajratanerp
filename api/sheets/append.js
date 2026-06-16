import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { appendSheetRow } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["POST"]);
    await requireAdmin(req);
    const { sheetName, row } = getRequestBody(req);
    await appendSheetRow(sheetName, row);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
