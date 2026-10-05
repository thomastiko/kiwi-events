// src/modules/adminAuth/adminAuth.service.js

import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { verifyPassword } from "../../core/security/password.service.js";
import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_ROLES,
} from "../eventUsers/eventUser.constants.js";
import {
  findAdminEventUserByEmail,
  updateAdminEventUserLastLogin,
} from "./adminAuth.repository.js";
import { toAdminUserDto } from "./adminAuth.dto.js";
function cleanIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeLoginEmail(value) {
  const identifier = cleanIdentifier(value);

  if (!identifier) {
    return "";
  }

  return identifier.includes("@") ? identifier : `${identifier}@admin`;
}

function hasAdminAccess(eventUser) {
  return (
    eventUser?.authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL &&
    eventUser?.role === EVENT_USER_ROLES.ADMIN
  );
}

function createAdminToken(eventUser) {
  const user = toAdminUserDto(eventUser);

  return jwt.sign(
    {
      sub: user.id,
      eventUserId: user.id,
      email: user.email,
      role: user.role,
      type: "KIWI_EVENTS_admin",
    },
    env.auth.localJwtSecret,
    {
      expiresIn: "12h",
    },
  );
}

function invalidLoginError() {
  return AppError.unauthorized("Invalid email or password.", {
    code: "ADMIN_LOGIN_INVALID",
    title: "Login failed",
    action: "Check your email and password, then try again.",
    fields: [
      {
        path: "body.email",
        message: "Check the email address.",
      },
      {
        path: "body.password",
        message: "Check the password.",
      },
    ],
  });
}

export async function loginAdminUser({ email, password }) {
  const loginEmail = normalizeLoginEmail(email);

  if (!loginEmail || !password) {
    throw invalidLoginError();
  }

  const eventUser = await findAdminEventUserByEmail(loginEmail);

  if (!eventUser?.passwordHash) {
    throw invalidLoginError();
  }

  const passwordMatches = await verifyPassword(
    password,
    eventUser.passwordHash,
  );

  if (!passwordMatches) {
    throw invalidLoginError();
  }

  if (!hasAdminAccess(eventUser)) {
    throw AppError.forbidden("Admin access is required.", {
      code: "ADMIN_ACCESS_REQUIRED",
      title: "Admin access required",
      action: "Log in with a local admin account.",
    });
  }

  await updateAdminEventUserLastLogin(eventUser.id);

  const user = toAdminUserDto(eventUser);
  const accessToken = createAdminToken(eventUser);

  return {
    accessToken,
    user,
  };
}
