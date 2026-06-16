export const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const numberValue = (value) => {
  const result = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(result) ? result : 0;
};

export const normalizeText = (value) =>
  String(value || "").trim().toLowerCase();

export const formatNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

export const formatCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
