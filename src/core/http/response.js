export function buildSuccessResponse({ data = null, meta } = {}) {
  return {
    success: true,
    data,
    ...(meta === undefined ? {} : { meta }),
  };
}

export function sendSuccess(res, { status = 200, data = null, meta } = {}) {
  return res.status(status).json(
    buildSuccessResponse({
      data,
      meta,
    }),
  );
}
