import {
  isMongoDatabase,
  isSqlDatabase,
} from "../../modules/database/database.service.js";
import {
  findActiveEventUserByExternalIdentity,
  findActiveEventUserById,
} from "../../modules/eventUsers/repositories/eventUser.repository.js";
import { AppError } from "../errors/AppError.js";

function isMongoObjectId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function cleanProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanExternalId(value) {
  return String(value || "").trim();
}

async function findActiveEventUserByIdentityId(identity) {
  const eventUserId = identity?.eventUserId
    ? String(identity.eventUserId).trim()
    : "";

  if (!eventUserId) {
    return null;
  }

  if (isMongoDatabase()) {
    if (!isMongoObjectId(eventUserId)) {
      return null;
    }

    return findActiveEventUserById(eventUserId);
  }

  if (isSqlDatabase()) {
    return findActiveEventUserById(eventUserId);
  }

  return null;
}

async function findActiveEventUserByIdentityExternalIdentity(identity) {
  const externalProvider = cleanProvider(identity?.externalProvider);
  const externalUserId = cleanExternalId(identity?.externalUserId);

  if (!externalProvider || !externalUserId) {
    return null;
  }

  return findActiveEventUserByExternalIdentity({
    provider: externalProvider,
    externalUserId,
  });
}

async function findActiveEventUserForIdentity(identity) {
  if (!identity) {
    return null;
  }

  const byEventUserId = await findActiveEventUserByIdentityId(identity);

  if (byEventUserId) {
    return byEventUserId;
  }

  return findActiveEventUserByIdentityExternalIdentity(identity);
}

export const attachEventUserIfExists = async (req, res, next) => {
  try {
    req.eventUser = await findActiveEventUserForIdentity(req.identity);
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireEventUser = async (req, res, next) => {
  try {
    const eventUser = await findActiveEventUserForIdentity(req.identity);

    if (!eventUser) {
      return next(
        AppError.forbidden(
          "No active kiwi-events user was found for this identity.",
          {
            code: "EVENT_USER_ACCESS_REQUIRED",
            title: "Event user access required",
            action:
              "Make sure this identity is linked to an active kiwi-events user.",
          },
        ),
      );
    }

    req.eventUser = eventUser;
    return next();
  } catch (error) {
    return next(error);
  }
};
