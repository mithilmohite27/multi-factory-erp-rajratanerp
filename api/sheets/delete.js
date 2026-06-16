import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { deleteSheetRow } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["DELETE", "POST"]);
    await requireAdmin(req);
    const { sheetName, rowIndex } = getRequestBody(req);
    await deleteSheetRow(sheetName, rowIndex);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
