import { sendSuccess } from "../../core/http/response.js";
import { toHealthDto } from "./health.dto.js";

export function getHealth(_req, res) {
  return sendSuccess(res, {
    data: toHealthDto(),
  });
}
