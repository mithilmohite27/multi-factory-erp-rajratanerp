import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";
import { appendSheetRow } from "../_lib/sheetsService.js";
import {
  assertRowAccess,
  authorizeRowForWrite,
  isDuplicatePaymentWrite,
} from "../_lib/factoryAccess.js";
import { readSheetRows } from "../_lib/sheetsService.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["POST"]);
    const user = await requireAdmin(req);
    const { sheetName, row } = getRequestBody(req);
    const authorizedRow = authorizeRowForWrite(user, row);
    if (
      (sheetName === "Customer_Payments" && authorizedRow.Payment_ID) ||
      (sheetName === "CashFlow_Log" &&
        authorizedRow.Linked_Module === "Customer Payments" &&
        authorizedRow.Linked_ID)
    ) {
      const rows = await readSheetRows(sheetName);
      const duplicate = isDuplicatePaymentWrite(sheetName, authorizedRow, rows);
      if (duplicate) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      if (sheetName === "Customer_Payments") {
        const order = (await readSheetRows("CRM_Log")).find(
          (item) => item.CRM_Order_ID === authorizedRow.CRM_Order_ID,
        );
        assertRowAccess(user, order);
        if (!order || order.Factory_ID !== authorizedRow.Factory_ID) {
          const error = new Error("Payment factory does not match the CRM order.");
          error.statusCode = 400;
          throw error;
        }
        const paid = rows
          .filter((item) => item.CRM_Order_ID === authorizedRow.CRM_Order_ID)
          .reduce((total, item) => total + Number(item.Amount || 0), 0);
        if (paid + Number(authorizedRow.Amount || 0) > Number(order.Order_Value || 0) + 0.01) {
          const error = new Error("Payment exceeds the remaining customer balance.");
          error.statusCode = 400;
          throw error;
        }
      }
      if (sheetName === "CashFlow_Log") {
        const payment = (await readSheetRows("Customer_Payments")).find(
          (item) => item.Payment_ID === authorizedRow.Linked_ID,
        );
        assertRowAccess(user, payment);
        if (!payment || payment.Factory_ID !== authorizedRow.Factory_ID) {
          const error = new Error("Cash entry factory does not match the customer payment.");
          error.statusCode = 400;
          throw error;
        }
      }
    }
    await appendSheetRow(sheetName, authorizedRow);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
