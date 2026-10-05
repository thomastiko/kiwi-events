import { DiscountCodeGroup } from "../discountCodeGroup.model.js";

import { DiscountCode } from "../discountCode.model.js";

function getSession(options = {}) {
  return options.session || options.trx?.session || null;
}

function applyOptions(query, options = {}) {
  if (options.lean) {
    query.lean();
  }

  return query;
}

export async function createDiscountCodeGroup(data, options = {}) {
  const group = new DiscountCodeGroup(data);

  const session = getSession(options);

  await group.save(
    session
      ? {
          session,
        }
      : {},
  );

  if (options.lean) {
    return group.toObject();
  }

  return group;
}

export function findDiscountCodeGroupById(id, options = {}) {
  const query = DiscountCodeGroup.findById(id);

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function findDiscountCodeGroupByIdAndEventId(
  { groupId, eventId },
  options = {},
) {
  const query = DiscountCodeGroup.findOne({
    _id: groupId,
    eventId,
  });

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function listDiscountCodeGroupsByEventId(eventId, options = {}) {
  const query = DiscountCodeGroup.find({
    eventId,
  }).sort({
    createdAt: -1,
  });

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function updateDiscountCodeGroupById(id, data, options = {}) {
  const query = DiscountCodeGroup.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export async function deleteDiscountCodeGroupById(id, options = {}) {
  const session = getSession(options);

  const findQuery = DiscountCodeGroup.findById(id);

  if (session) {
    findQuery.session(session);
  }

  const group = await findQuery;

  if (!group) {
    return null;
  }

  const deleteCodesQuery = DiscountCode.deleteMany({
    groupId: group._id,
  });

  if (session) {
    deleteCodesQuery.session(session);
  }

  await deleteCodesQuery;

  const deleteGroupQuery = DiscountCodeGroup.deleteOne({
    _id: group._id,
  });

  if (session) {
    deleteGroupQuery.session(session);
  }

  await deleteGroupQuery;

  if (options.lean) {
    return group.toObject();
  }

  return group;
}

export async function insertDiscountCodes(items, options = {}) {
  return DiscountCode.insertMany(items, {
    session: getSession(options),
  });
}

export function findDiscountCodeById(id, options = {}) {
  const query = DiscountCode.findById(id);

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function findDiscountCodeByEventIdAndCode(
  { eventId, code },
  options = {},
) {
  const query = DiscountCode.findOne({
    eventId,
    code,
  });

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}
export function findDiscountCodesByEventIdAndCodes(
  { eventId, codes },
  options = {},
) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return [];
  }

  const query = DiscountCode.find({
    eventId,
    code: {
      $in: codes,
    },
  });

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}
export function listDiscountCodesByGroupId(groupId, options = {}) {
  const query = DiscountCode.find({
    groupId,
  }).sort({
    createdAt: 1,
  });

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function updateDiscountCodeById(id, data, options = {}) {
  const query = DiscountCode.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export function deleteDiscountCodeById(id, options = {}) {
  const query = DiscountCode.findByIdAndDelete(id);

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  return applyOptions(query, options);
}

export async function deleteDiscountCodeDataByEventId(eventId, options = {}) {
  const session = getSession(options);

  const codesQuery = DiscountCode.deleteMany({
    eventId,
  });

  if (session) {
    codesQuery.session(session);
  }

  await codesQuery;

  const groupsQuery = DiscountCodeGroup.deleteMany({
    eventId,
  });

  if (session) {
    groupsQuery.session(session);
  }

  await groupsQuery;
}
