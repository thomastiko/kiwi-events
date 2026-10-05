import multer from "multer";
import { AppError } from "../errors/AppError.js";

const storage = multer.memoryStorage();

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      AppError.badRequest(
        "Invalid file type. Only JPG, PNG, WEBP and GIF images are allowed.",
        {
          code: "INVALID_MEDIA_FILE_TYPE",
          title: "Invalid file type",
          action: "Upload a JPG, PNG, WEBP or GIF image.",
          fields: [
            {
              path: "body.file",
              message: "Only JPG, PNG, WEBP and GIF images are allowed.",
            },
          ],
        },
      ),
    );
  }

  return cb(null, true);
}

export const uploadEventMediaImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
