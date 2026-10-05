function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function toPublicCustomerOrderCancellationDto(eligibility) {
  return {
    allowed: eligibility?.allowed === true,

    action: eligibility?.action || null,

    reason: eligibility?.reason || null,

    deadlineAt: toIsoString(eligibility?.deadlineAt),

    earliestRelevantSessionStartAt: toIsoString(
      eligibility?.earliestRelevantSessionStartAt,
    ),
  };
}
