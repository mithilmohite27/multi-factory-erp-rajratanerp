import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { readSheetRows, updateSheetRow } from "../_lib/sheetsService.js";
import { assertRowAccess, authorizeRowForWrite } from "../_lib/factoryAccess.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["PUT", "POST"]);
    const user = await requireAdmin(req);
    const { sheetName, rowIndex, row } = getRequestBody(req);
    const existing = (await readSheetRows(sheetName)).find(
      (item) => Number(item._rowIndex) === Number(rowIndex),
    );
    assertRowAccess(user, existing);
    await updateSheetRow(
      sheetName,
      rowIndex,
      authorizeRowForWrite(user, row, existing),
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
