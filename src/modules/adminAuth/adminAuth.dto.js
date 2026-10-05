import { toApiId } from "../../core/dto/contractValue.dto.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

export function toAdminUserDto(eventUser) {
  if (!eventUser) {
    throw new TypeError("Cannot serialize a missing admin user.");
  }

  if (eventUser.id === null || eventUser.id === undefined) {
    throw new TypeError("Cannot serialize an invalid API id.");
  }

  const id = toApiId(eventUser.id);
  const email = cleanString(eventUser.emailSnapshot).toLowerCase();
  const firstName = cleanString(eventUser.firstNameSnapshot);
  const lastName = cleanString(eventUser.lastNameSnapshot);
  const role = cleanString(eventUser.role);

  if (!email) {
    throw new TypeError("Cannot serialize an admin user without an email.");
  }

  if (!role) {
    throw new TypeError("Cannot serialize an admin user without a role.");
  }

  return {
    id,
    email,
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(" ") || email,
    role,
    mustChangePassword: Boolean(eventUser.mustChangePassword),
  };
}
