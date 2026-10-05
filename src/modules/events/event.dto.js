import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import {
  EVENT_CATEGORY_VALUES,
  EVENT_STATUS_VALUES,
  EVENT_VISIBILITY_VALUES,
  SESSION_STATUSES,
  SESSION_STATUS_VALUES,
} from "./event.constants.js";

import {
  toAdminTicketTypeDto,
  toPublicTicketTypeDto,
} from "../ticketTypes/ticketType.dto.js";

import { getMediaAssetFileUrl } from "../mediaAssets/mediaAsset.url.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize an event without ${fieldName}.`);
  }

  return id;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Cannot serialize an event without ${fieldName}.`);
  }

  return normalized;
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized || null;
}

function normalizeEnum(value, allowedValues, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!allowedValues.includes(normalized)) {
    throw new TypeError(`Cannot serialize an invalid event ${fieldName}.`);
  }

  return normalized;
}

function normalizeInteger(
  value,
  fieldName,
  { nullable = false, minimum } = {},
) {
  if (value === null || value === undefined) {
    if (nullable) {
      return null;
    }

    throw new TypeError(`Cannot serialize an event without ${fieldName}.`);
  }

  const normalized = Number(value);

  if (
    !Number.isInteger(normalized) ||
    (minimum !== undefined && normalized < minimum)
  ) {
    throw new TypeError(`Cannot serialize an invalid event ${fieldName}.`);
  }

  return normalized;
}

function normalizeStringArray(values, fieldName) {
  if (values === null || values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new TypeError(`Cannot serialize invalid event ${fieldName}.`);
  }

  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function normalizeIdArray(values, fieldName) {
  if (values === null || values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new TypeError(`Cannot serialize invalid event ${fieldName}.`);
  }

  return values.map((value) => requireApiId(value, fieldName));
}

function assertValidWindow(startAt, endAt, fieldName) {
  if (
    startAt !== null &&
    endAt !== null &&
    new Date(endAt) <= new Date(startAt)
  ) {
    throw new TypeError(`Cannot serialize an invalid event ${fieldName}.`);
  }
}

export function toEventSessionDto(session) {
  if (!session) {
    throw new TypeError("Cannot serialize a missing event session.");
  }

  const startAt = toApiDate(session.startAt);
  const endAt = toApiDate(session.endAt);

  if (!startAt || !endAt) {
    throw new TypeError(
      "Cannot serialize an event session without startAt and endAt.",
    );
  }

  assertValidWindow(startAt, endAt, "session time window");

  const status = normalizeEnum(
    session.status,
    SESSION_STATUS_VALUES,
    "session status",
  );

  return {
    id: requireApiId(session.id, "session id"),

    startAt,
    endAt,

    timezone: normalizeRequiredString(session.timezone, "session timezone"),

    locationLabel: normalizeOptionalString(session.locationLabel),

    locationDetails: normalizeOptionalString(session.locationDetails),

    capacity: normalizeInteger(session.capacity, "session capacity", {
      nullable: true,
      minimum: 1,
    }),

    status,
    isCancelled: status === SESSION_STATUSES.CANCELLED,
  };
}

export function toEventFaqDto(faq) {
  if (!faq) {
    throw new TypeError("Cannot serialize a missing event FAQ.");
  }

  return {
    id: requireApiId(faq.id, "FAQ id"),

    question: normalizeRequiredString(faq.question, "FAQ question"),

    answer: normalizeRequiredString(faq.answer, "FAQ answer"),

    sortOrder: normalizeInteger(faq.sortOrder ?? 0, "FAQ sortOrder", {
      minimum: 0,
    }),
  };
}

export function toEventImageAssetDto(asset) {
  if (!asset) {
    throw new TypeError("Cannot serialize a missing event image asset.");
  }

  const id = requireApiId(asset.id, "image asset id");

  return {
    id,
    fileUrl: getMediaAssetFileUrl(asset),

    filenameOriginal: normalizeRequiredString(
      asset.filenameOriginal,
      "image asset filenameOriginal",
    ),

    mimeType: normalizeRequiredString(asset.mimeType, "image asset mimeType"),

    size: normalizeInteger(asset.size, "image asset size", {
      minimum: 0,
    }),
  };
}

function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) {
    throw new TypeError("Cannot serialize invalid event sessions.");
  }

  return sessions
    .map(toEventSessionDto)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
}

function normalizeFaqs(faqs) {
  if (faqs === null || faqs === undefined) {
    return [];
  }

  if (!Array.isArray(faqs)) {
    throw new TypeError("Cannot serialize invalid event FAQs.");
  }

  return faqs
    .map(toEventFaqDto)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeImageAssets(imageAssets) {
  if (imageAssets === null || imageAssets === undefined) {
    return [];
  }

  if (!Array.isArray(imageAssets)) {
    throw new TypeError("Cannot serialize invalid event image assets.");
  }

  return imageAssets.map(toEventImageAssetDto);
}

function buildEventBaseDto(event, { imageAssets = [] } = {}) {
  if (!event) {
    throw new TypeError("Cannot serialize a missing event.");
  }

  const sessions = normalizeSessions(event.sessions);

  const salesStartAt = toApiDate(event.salesStartAt);

  const salesEndAt = toApiDate(event.salesEndAt);

  assertValidWindow(salesStartAt, salesEndAt, "sales window");

  return {
    id: requireApiId(event.id, "id"),

    title: normalizeRequiredString(event.title, "title"),

    slug: normalizeRequiredString(event.slug, "slug"),

    shortDescription: normalizeOptionalString(event.shortDescription),

    description: normalizeOptionalString(event.description),

    category: normalizeEnum(event.category, EVENT_CATEGORY_VALUES, "category"),

    status: normalizeEnum(event.status, EVENT_STATUS_VALUES, "status"),

    visibility: normalizeEnum(
      event.visibility,
      EVENT_VISIBILITY_VALUES,
      "visibility",
    ),

    location: normalizeOptionalString(event.location),

    tags: normalizeStringArray(event.tags, "tags"),

    sessions,

    faqs: normalizeFaqs(event.faqs),

    imageAssets: normalizeImageAssets(imageAssets),

    startsAt: sessions.length > 0 ? sessions[0].startAt : null,

    endsAt: sessions.length > 0 ? sessions[sessions.length - 1].endAt : null,

    isFree: Boolean(event.isFree),

    salesStartAt,
    salesEndAt,

    isFeatured: Boolean(event.isFeatured),

    featuredOrder: normalizeInteger(event.featuredOrder ?? 0, "featuredOrder", {
      minimum: 0,
    }),

    publishedAt: toApiDate(event.publishedAt),

    cancelledAt: toApiDate(event.cancelledAt),
  };
}

export function toPublicEventDto(
  event,
  { ticketTypes = [], imageAssets = [], now = new Date() } = {},
) {
  const base = buildEventBaseDto(event, {
    imageAssets,
  });

  if (!Array.isArray(ticketTypes)) {
    throw new TypeError("Cannot serialize invalid public event ticketTypes.");
  }

  const publicTicketTypes = ticketTypes.map((ticketType) =>
    toPublicTicketTypeDto(ticketType, {
      now,
    }),
  );

  return {
    id: base.id,
    title: base.title,
    slug: base.slug,
    shortDescription: base.shortDescription,
    description: base.description,
    category: base.category,
    status: base.status,
    visibility: base.visibility,
    location: base.location,
    imageAssets: base.imageAssets,
    tags: base.tags,
    sessions: base.sessions,
    faqs: base.faqs,
    startsAt: base.startsAt,
    endsAt: base.endsAt,
    isFeatured: base.isFeatured,
    isFree: base.isFree,
    salesStartAt: base.salesStartAt,
    salesEndAt: base.salesEndAt,
    publishedAt: base.publishedAt,
    cancelledAt: base.cancelledAt,

    isBookable: publicTicketTypes.some((ticketType) => ticketType.isSalesOpen),

    ticketTypes: publicTicketTypes,
  };
}

function buildAdminEventDto(event, { imageAssets = [] } = {}) {
  const base = buildEventBaseDto(event, {
    imageAssets,
  });

  return {
    ...base,

    imageAssetIds: normalizeIdArray(event.imageAssetIds, "imageAssetIds"),

    notesInternal: normalizeOptionalString(event.notesInternal),

    createdByEventUserId: toApiId(event.createdByEventUserId),

    updatedByEventUserId: toApiId(event.updatedByEventUserId),

    cancellationReason: normalizeNullableString(event.cancellationReason),

    isCancellationFinalized: Boolean(event.isCancellationFinalized),

    cancellationFinalizedAt: toApiDate(event.cancellationFinalizedAt),

    archivedAt: toApiDate(event.archivedAt),

    createdAt: toApiDate(event.createdAt),

    updatedAt: toApiDate(event.updatedAt),
  };
}

export function toAdminEventListItemDto(
  event,
  { imageAssets = [], stats = {} } = {},
) {
  const dto = buildAdminEventDto(event, {
    imageAssets,
  });

  return {
    ...dto,

    stats: {
      ordersCount: normalizeInteger(
        stats.ordersCount ?? 0,
        "stats.ordersCount",
        {
          minimum: 0,
        },
      ),

      paidOrdersCount: normalizeInteger(
        stats.paidOrdersCount ?? 0,
        "stats.paidOrdersCount",
        {
          minimum: 0,
        },
      ),

      ticketsSold: normalizeInteger(
        stats.ticketsSold ?? 0,
        "stats.ticketsSold",
        {
          minimum: 0,
        },
      ),
    },
  };
}

export function toAdminEventDetailDto(
  event,
  { imageAssets = [], ticketTypes = [], now = new Date() } = {},
) {
  const dto = buildAdminEventDto(event, {
    imageAssets,
  });

  if (!Array.isArray(ticketTypes)) {
    throw new TypeError("Cannot serialize invalid admin event ticketTypes.");
  }

  return {
    ...dto,

    ticketTypes: ticketTypes.map((ticketType) =>
      toAdminTicketTypeDto(ticketType, {
        now,
      }),
    ),
  };
}
