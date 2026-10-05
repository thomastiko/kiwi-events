import { sendSuccess } from "../../core/http/response.js";
import { toAdminUserDto } from "./adminAuth.dto.js";
import { loginAdminUser } from "./adminAuth.service.js";

export async function loginAdminHandler(req, res) {
  const result = await loginAdminUser(req.validated.body);

  return sendSuccess(res, {
    data: result,
  });
}

export async function getAdminMeHandler(req, res) {
  return sendSuccess(res, {
    data: {
      user: toAdminUserDto(req.eventUser),
    },
  });
}
