import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { SHEET_SCHEMAS } from "../_lib/schemas.js";
import { ensureSheetHeaders } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["POST"]);
    await requireAdmin(req);
    const { sheetName, headers } = getRequestBody(req);
    const expectedHeaders = SHEET_SCHEMAS[sheetName];

    if (
      sheetName === "Config" ||
      !expectedHeaders ||
      JSON.stringify(headers) !== JSON.stringify(expectedHeaders)
    ) {
      const error = new Error("Headers do not match the approved schema.");
      error.statusCode = 400;
      throw error;
    }

    const result = await ensureSheetHeaders(sheetName, expectedHeaders);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    sendError(res, error);
  }
}
