import { toApiId } from "../../../core/dto/contractValue.dto.js";

function toMailResultItemDto(item) {
  return {
    orderIds: Array.isArray(item?.orderIds)
      ? item.orderIds.map((orderId) => toApiId(orderId))
      : [],

    email: String(item?.email || "") || null,

    emailLogId: item?.emailLogId ? toApiId(item.emailLogId) : null,

    reason: String(item?.reason || "") || null,

    error: String(item?.error || "") || null,
  };
}

export function toCustomEventMailResultDto(result) {
  return {
    requestId: result.requestId,

    eventId: toApiId(result.eventId),

    audience: result.audience,

    audienceOrderCount: Number(result.audienceOrderCount || 0),

    recipientCount: Number(result.recipientCount || 0),

    attachmentCount: Number(result.attachmentCount || 0),
    mailConcurrency: Number(result.mailConcurrency || 1),
    attachmentNames: Array.isArray(result.attachmentNames)
      ? result.attachmentNames
      : [],

    sentCount: Number(result.sentCount || 0),

    skippedCount: Number(result.skippedCount || 0),

    failedCount: Number(result.failedCount || 0),

    sent: (result.sent || []).map(toMailResultItemDto),

    skipped: (result.skipped || []).map(toMailResultItemDto),

    failed: (result.failed || []).map(toMailResultItemDto),
  };
}
