import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";

import { getDatabaseProvider } from "../../database/database.service.js";

import * as mongoRepository from "./mongo.discountCode.repository.js";
import * as sqlRepository from "./sql.discountCode.repository.js";

function getContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function normalizeId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(
      `Cannot normalize discount code data without ${fieldName}.`,
    );
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(
      `Cannot normalize discount code data without ${fieldName}.`,
    );
  }

  return id;
}

function toCanonicalGroup(record, provider) {
  if (!record) {
    return null;
  }

  const value =
    typeof record.toObject === "function" ? record.toObject() : record;

  const rawId = provider === DATABASE_PROVIDER.MONGODB ? value._id : value.id;

  const { _id, __v, id: ignoredId, eventId, ...fields } = value;

  return {
    id: normalizeId(rawId, "group id"),

    eventId: normalizeId(eventId, "event id"),

    ...fields,
  };
}

function toCanonicalCode(record, provider) {
  if (!record) {
    return null;
  }

  const value =
    typeof record.toObject === "function" ? record.toObject() : record;

  const rawId = provider === DATABASE_PROVIDER.MONGODB ? value._id : value.id;

  const { _id, __v, id: ignoredId, eventId, groupId, ...fields } = value;

  return {
    id: normalizeId(rawId, "discount code id"),

    eventId: normalizeId(eventId, "event id"),

    groupId: normalizeId(groupId, "group id"),

    ...fields,
  };
}

export async function createDiscountCodeGroup(data, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalGroup(
    await repository.createDiscountCodeGroup(data, options),
    provider,
  );
}

export async function findDiscountCodeGroupById(id, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalGroup(
    await repository.findDiscountCodeGroupById(id, options),
    provider,
  );
}

export async function findDiscountCodeGroupByIdAndEventId(input, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalGroup(
    await repository.findDiscountCodeGroupByIdAndEventId(input, options),
    provider,
  );
}

export async function listDiscountCodeGroupsByEventId(eventId, options = {}) {
  const { provider, repository } = getContext();

  const groups = await repository.listDiscountCodeGroupsByEventId(
    eventId,
    options,
  );

  return (groups || []).map((group) => toCanonicalGroup(group, provider));
}

export async function updateDiscountCodeGroupById(id, data, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalGroup(
    await repository.updateDiscountCodeGroupById(id, data, options),
    provider,
  );
}

export async function deleteDiscountCodeGroupById(id, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalGroup(
    await repository.deleteDiscountCodeGroupById(id, options),
    provider,
  );
}

export async function insertDiscountCodes(items, options = {}) {
  const { provider, repository } = getContext();

  const codes = await repository.insertDiscountCodes(items, options);

  return (codes || []).map((code) => toCanonicalCode(code, provider));
}

export async function findDiscountCodeById(id, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalCode(
    await repository.findDiscountCodeById(id, options),
    provider,
  );
}

export async function findDiscountCodeByEventIdAndCode(input, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalCode(
    await repository.findDiscountCodeByEventIdAndCode(input, options),
    provider,
  );
}

export async function findDiscountCodesByEventIdAndCodes(input, options = {}) {
  const { provider, repository } = getContext();

  const codes = await repository.findDiscountCodesByEventIdAndCodes(
    input,
    options,
  );

  return (codes || []).map((code) => toCanonicalCode(code, provider));
}

export async function listDiscountCodesByGroupId(groupId, options = {}) {
  const { provider, repository } = getContext();

  const codes = await repository.listDiscountCodesByGroupId(groupId, options);

  return (codes || []).map((code) => toCanonicalCode(code, provider));
}

export async function updateDiscountCodeById(id, data, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalCode(
    await repository.updateDiscountCodeById(id, data, options),
    provider,
  );
}

export async function deleteDiscountCodeById(id, options = {}) {
  const { provider, repository } = getContext();

  return toCanonicalCode(
    await repository.deleteDiscountCodeById(id, options),
    provider,
  );
}

export async function deleteDiscountCodeDataByEventId(eventId, options = {}) {
  const { repository } = getContext();

  return repository.deleteDiscountCodeDataByEventId(eventId, options);
}
