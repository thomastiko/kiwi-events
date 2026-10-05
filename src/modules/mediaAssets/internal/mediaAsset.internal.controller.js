import { sendSuccess } from "../../../core/http/response.js";
import { toMediaAssetDto } from "../mediaAsset.dto.js";
import {
  deleteEventImageAssetService,
  listEventImageAssetsService,
} from "./mediaAsset.internal.service.js";

export async function listEventImageAssetsHandler(_req, res) {
  const items = await listEventImageAssetsService();

  return sendSuccess(res, {
    data: items.map(toMediaAssetDto),
  });
}

export async function deleteEventImageAssetHandler(req, res) {
  const result = await deleteEventImageAssetService(req.validated.params.id);

  return sendSuccess(res, {
    data: result,
  });
}
