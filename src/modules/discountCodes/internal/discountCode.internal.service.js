import { randomReadableCode } from "../../../core/utils/codeGenerator.js";

import { canManageEvent } from "../../permissions/eventAuthorization.service.js";

import { findEventById } from "../../events/repositories/event.repository.js";

import {
  createDiscountCodeGroup,
  deleteDiscountCodeById,
  deleteDiscountCodeGroupById,
  findDiscountCodeById,
  findDiscountCodeByEventIdAndCode,
  findDiscountCodeGroupById,
  findDiscountCodesByEventIdAndCodes,
  insertDiscountCodes,
  listDiscountCodeGroupsByEventId,
  listDiscountCodesByGroupId,
  updateDiscountCodeById,
  updateDiscountCodeGroupById,
} from "../repositories/discountCode.repository.js";

import {
  toAdminDiscountCodeDto,
  toAdminDiscountCodeGroupDto,
} from "../discountCode.dto.js";

import {
  discountCodeAccessRequiredError,
  discountCodeAlreadyExistsError,
  discountCodeEventNotFoundError,
  discountCodeGroupNotFoundError,
  discountCodeManageForbiddenError,
  discountCodeNotFoundError,
} from "../discountCode.errors.js";

const GENERATED_CODE_LENGTH = 8;

function assertInternalActor(actor) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw discountCodeAccessRequiredError();
  }
}

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function isDuplicateStorageError(error) {
  const code = error?.code ?? error?.cause?.code;

  const errno = error?.errno ?? error?.cause?.errno;

  return code === 11000 || code === "ER_DUP_ENTRY" || errno === 1062;
}

async function loadManageableEvent(eventId, actor) {
  assertInternalActor(actor);

  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw discountCodeEventNotFoundError(eventId);
  }

  if (!(await canManageEvent(actor, event))) {
    throw discountCodeManageForbiddenError();
  }

  return event;
}

async function loadManageableGroup(groupId, actor) {
  const group = await findDiscountCodeGroupById(groupId, {
    lean: true,
  });

  if (!group) {
    throw discountCodeGroupNotFoundError(groupId);
  }

  await loadManageableEvent(group.eventId, actor);

  return group;
}

async function loadManageableCode(codeId, actor) {
  const code = await findDiscountCodeById(codeId, {
    lean: true,
  });

  if (!code) {
    throw discountCodeNotFoundError(codeId);
  }

  await loadManageableEvent(code.eventId, actor);

  return code;
}

function assertNoDuplicateCodes(codes, eventId) {
  const seen = new Set();

  for (const code of codes) {
    if (seen.has(code)) {
      throw discountCodeAlreadyExistsError({
        eventId,
        code,
      });
    }

    seen.add(code);
  }
}

async function assertCodesDoNotExist(eventId, codes, ignoredCodeId = null) {
  const existing = await findDiscountCodesByEventIdAndCodes(
    {
      eventId,
      codes,
    },
    {
      lean: true,
    },
  );

  const conflict = existing.find(
    (code) => String(code.id) !== String(ignoredCodeId || ""),
  );

  if (conflict) {
    throw discountCodeAlreadyExistsError({
      eventId,
      code: conflict.code,
    });
  }
}

async function generateUniqueCodes(eventId, count) {
  const generated = new Set();

  while (generated.size < count) {
    while (generated.size < count) {
      generated.add(randomReadableCode(GENERATED_CODE_LENGTH));
    }

    const candidates = Array.from(generated);

    const existing = await findDiscountCodesByEventIdAndCodes(
      {
        eventId,
        codes: candidates,
      },
      {
        lean: true,
      },
    );

    if (existing.length === 0) {
      return candidates;
    }

    for (const item of existing) {
      generated.delete(normalizeCode(item.code));
    }
  }

  return Array.from(generated);
}

export async function listDiscountCodeGroupsService(eventId, actor) {
  const event = await loadManageableEvent(eventId, actor);

  const groups = await listDiscountCodeGroupsByEventId(event.id, {
    lean: true,
  });

  return groups.map(toAdminDiscountCodeGroupDto);
}

export async function createDiscountCodeGroupService(payload, actor) {
  const event = await loadManageableEvent(payload.eventId, actor);

  const created = await createDiscountCodeGroup({
    eventId: event.id,

    name: payload.name.trim(),

    discountPercent: payload.discountPercent,

    isActive: payload.isActive ?? true,
  });

  return toAdminDiscountCodeGroupDto(created);
}

export async function updateDiscountCodeGroupService(groupId, payload, actor) {
  await loadManageableGroup(groupId, actor);

  const update = {};

  if (payload.name !== undefined) {
    update.name = payload.name.trim();
  }

  if (payload.discountPercent !== undefined) {
    update.discountPercent = payload.discountPercent;
  }

  if (payload.isActive !== undefined) {
    update.isActive = payload.isActive;
  }

  const updated = await updateDiscountCodeGroupById(groupId, update);

  if (!updated) {
    throw discountCodeGroupNotFoundError(groupId);
  }

  return toAdminDiscountCodeGroupDto(updated);
}

export async function deleteDiscountCodeGroupService(groupId, actor) {
  await loadManageableGroup(groupId, actor);

  const deleted = await deleteDiscountCodeGroupById(groupId);

  if (!deleted) {
    throw discountCodeGroupNotFoundError(groupId);
  }

  return {
    deleted: true,
  };
}

export async function listDiscountCodesService(groupId, actor) {
  const group = await loadManageableGroup(groupId, actor);

  const codes = await listDiscountCodesByGroupId(group.id, {
    lean: true,
  });

  return codes.map(toAdminDiscountCodeDto);
}

export async function createDiscountCodesService(groupId, payload, actor) {
  const group = await loadManageableGroup(groupId, actor);

  let codes;

  if (payload.codes) {
    codes = payload.codes.map(normalizeCode);

    assertNoDuplicateCodes(codes, group.eventId);

    await assertCodesDoNotExist(group.eventId, codes);
  } else {
    codes = await generateUniqueCodes(group.eventId, payload.generateCount);
  }

  try {
    const created = await insertDiscountCodes(
      codes.map((code) => ({
        eventId: group.eventId,

        groupId: group.id,

        code,

        isActive: true,
      })),
    );

    return created.map(toAdminDiscountCodeDto);
  } catch (error) {
    if (isDuplicateStorageError(error)) {
      throw discountCodeAlreadyExistsError({
        eventId: group.eventId,
      });
    }

    throw error;
  }
}

export async function updateDiscountCodeService(codeId, payload, actor) {
  const existing = await loadManageableCode(codeId, actor);

  const update = {};

  if (payload.code !== undefined) {
    const code = normalizeCode(payload.code);

    await assertCodesDoNotExist(existing.eventId, [code], existing.id);

    update.code = code;
  }

  if (payload.isActive !== undefined) {
    update.isActive = payload.isActive;
  }

  try {
    const updated = await updateDiscountCodeById(codeId, update);

    if (!updated) {
      throw discountCodeNotFoundError(codeId);
    }

    return toAdminDiscountCodeDto(updated);
  } catch (error) {
    if (isDuplicateStorageError(error)) {
      throw discountCodeAlreadyExistsError({
        eventId: existing.eventId,

        code: update.code || null,
      });
    }

    throw error;
  }
}

export async function deleteDiscountCodeService(codeId, actor) {
  await loadManageableCode(codeId, actor);

  const deleted = await deleteDiscountCodeById(codeId);

  if (!deleted) {
    throw discountCodeNotFoundError(codeId);
  }

  return {
    deleted: true,
  };
}
