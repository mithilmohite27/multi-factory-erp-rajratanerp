export function allowMethods(req, allowedMethods) {
  if (!allowedMethods.includes(req.method)) {
    const error = new Error("Method not allowed.");
    error.statusCode = 405;
    error.allow = allowedMethods.join(", ");
    throw error;
  }
}

export function getRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      const error = new Error("Invalid JSON request body.");
      error.statusCode = 400;
      throw error;
    }
  }
  return req.body;
}

export function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" ? token : "";
}

export function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  if (error.allow) {
    res.setHeader("Allow", error.allow);
  }

  if (statusCode >= 500) {
    console.error(error);
  }

  const safeMessage =
    statusCode >= 500 && isProduction && !error.expose
      ? "The server could not complete the request."
      : error.message || "Request failed.";

  res.status(statusCode).json({ ok: false, error: safeMessage });
}
