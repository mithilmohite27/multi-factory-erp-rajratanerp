export function isSuperAdminUser(user) {
  return String(user?.role || "").trim().toLowerCase() === "super admin";
}

export function assignedFactoryIds(user) {
  return Array.isArray(user?.factoryIds)
    ? user.factoryIds.map((value) => String(value).trim()).filter(Boolean)
    : [];
}

export function scopeRowsForUser(user, rows) {
  if (isSuperAdminUser(user)) return rows;
  const allowed = new Set(assignedFactoryIds(user));
  return (rows || []).filter((row) => allowed.has(String(row.Factory_ID || "")));
}

export function authorizeRowForWrite(user, row, existingRow = null) {
  if (isSuperAdminUser(user)) return row;
  const allowed = assignedFactoryIds(user);
  if (allowed.length === 0) {
    const error = new Error("No factory is assigned to this user.");
    error.statusCode = 403;
    throw error;
  }
  const factoryId = String(existingRow?.Factory_ID || row?.Factory_ID || allowed[0]);
  if (!allowed.includes(factoryId)) {
    const error = new Error("You do not have access to this factory.");
    error.statusCode = 403;
    throw error;
  }
  return { ...row, Factory_ID: factoryId };
}

export function assertRowAccess(user, row) {
  if (isSuperAdminUser(user)) return;
  if (!row || !assignedFactoryIds(user).includes(String(row.Factory_ID || ""))) {
    const error = new Error("You do not have access to this factory record.");
    error.statusCode = 403;
    throw error;
  }
}

export function isDuplicatePaymentWrite(sheetName, row, existingRows) {
  if (sheetName === "Customer_Payments" && row?.Payment_ID) {
    return existingRows.some(
      (existing) => existing.Payment_ID === row.Payment_ID,
    );
  }
  if (
    sheetName === "CashFlow_Log" &&
    row?.Linked_Module === "Customer Payments" &&
    row?.Linked_ID
  ) {
    return existingRows.some(
      (existing) =>
        existing.Linked_Module === "Customer Payments" &&
        existing.Linked_ID === row.Linked_ID,
    );
  }
  return false;
}
