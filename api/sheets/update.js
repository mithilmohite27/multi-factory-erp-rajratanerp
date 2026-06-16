import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { updateSheetRow } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["PUT", "POST"]);
    await requireAdmin(req);
    const { sheetName, rowIndex, row } = getRequestBody(req);
    await updateSheetRow(sheetName, rowIndex, row);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
