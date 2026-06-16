import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import * as sheetsService from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["POST"]);
    await requireAdmin(req);
    const { sheetNames } = getRequestBody(req);

    if (!Array.isArray(sheetNames)) {
      const error = new Error("Sheet names are required.");
      error.statusCode = 400;
      throw error;
    }

    const data =
      typeof sheetsService.readSheetRowsBatch === "function"
        ? await sheetsService.readSheetRowsBatch(sheetNames)
        : Object.fromEntries(
            await Promise.all(
              [...new Set(sheetNames)].map(async (sheetName) => [
                sheetName,
                await sheetsService.readSheetRows(sheetName),
              ]),
            ),
          );
    res.status(200).json({ ok: true, data });
  } catch (error) {
    sendError(res, error);
  }
}
