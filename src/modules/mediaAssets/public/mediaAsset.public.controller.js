import { getPublicMediaAssetFileService } from "./mediaAsset.public.service.js";

function safeFilename(filename = "media-file") {
  return String(filename).replace(/["\r\n]/g, "");
}

export async function downloadPublicMediaAssetFileHandler(req, res) {
  const { id } = req.params;

  const result = await getPublicMediaAssetFileService(id);

  res.setHeader("Content-Type", result.contentType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${safeFilename(result.filename)}"`,
  );

  // Allow public event images to be embedded from external frontends.
  // Without this, Helmet can block <img> cross-origin usage with:
  // ERR_BLOCKED_BY_RESPONSE.NotSameOrigin
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (result.cacheControl) {
    res.setHeader("Cache-Control", result.cacheControl);
  }

  if (result.contentLength) {
    res.setHeader("Content-Length", String(result.contentLength));
  }

  return res.status(200).send(result.buffer);
}
