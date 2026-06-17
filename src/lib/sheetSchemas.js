export const CRM_LOG_HEADERS = Object.freeze([
  "Factory_ID", "CRM_Order_ID", "Date", "Client_Name", "Phone",
  "Location", "Color", "Order_Brass", "Order_Blocks", "Rate_Per_Brass",
  "Order_Value", "Status", "Notes", "Created_At", "Product_Size",
  "Priority", "Due_Date",
]);

export const DISPATCH_LOG_HEADERS = Object.freeze([
  "Factory_ID", "Dispatch_ID", "CRM_Order_ID", "Date", "Client_Name",
  "Color", "Dispatch_Brass", "Dispatch_Blocks", "Transport_Type",
  "Driver_Contact", "Vehicle_Number", "Freight_Amount", "Revenue", "Notes",
  "Created_At", "Product_Size",
]);

export const QC_LOG_HEADERS = Object.freeze([
  "Factory_ID", "QC_ID", "QC_Group_ID", "Date", "Color", "Broken_Blocks",
  "Cost_Per_Block", "QC_Loss", "Reason", "Notes", "Created_At",
  "Product_Size",
]);

export const CUSTOMER_PAYMENT_HEADERS = Object.freeze([
  "Factory_ID", "Payment_ID", "CRM_Order_ID", "Date", "Client_Name",
  "Amount", "Payment_Source", "Reference", "Notes", "Created_At",
]);

export const STOCK_THRESHOLD_HEADERS = Object.freeze([
  "Factory_ID", "Threshold_ID", "Product_Size", "Color", "Minimum_Blocks",
  "Updated_At",
]);
