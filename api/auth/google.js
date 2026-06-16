import { registerOrAuthorizeAdmin } from "../_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "../_lib/http.js";

export default async function handler(req, res) {
  try {
    allowMethods(req, ["POST"]);
    const { credential } = getRequestBody(req);
    const user = await registerOrAuthorizeAdmin(credential);
    res.status(200).json({ ok: true, user });
  } catch (error) {
    sendError(res, error);
  }
}
