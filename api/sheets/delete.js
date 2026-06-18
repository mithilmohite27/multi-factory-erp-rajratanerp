import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { deleteSheetRow, readSheetRows } from "../_lib/sheetsService.js";
import { assertRowAccess } from "../_lib/factoryAccess.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["DELETE", "POST"]);
    const user = await requireAdmin(req);
    const { sheetName, rowIndex } = getRequestBody(req);
    const existing = (await readSheetRows(sheetName)).find(
      (item) => Number(item._rowIndex) === Number(rowIndex),
    );
    assertRowAccess(user, existing);
    await deleteSheetRow(sheetName, rowIndex);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
