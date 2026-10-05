function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}

export function buildOrderBuyerSnapshot({
  email,
  firstName,
  lastName,
  displayName = null,
} = {}) {
  const normalizedFirstName = cleanString(firstName);
  const normalizedLastName = cleanString(lastName);

  const normalizedDisplayName =
    cleanString(displayName) ||
    [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ");

  return {
    buyerEmailSnapshot: cleanEmail(email),
    buyerFirstNameSnapshot: normalizedFirstName,
    buyerLastNameSnapshot: normalizedLastName,
    buyerDisplayNameSnapshot: normalizedDisplayName,
  };
}

export function getOrderBuyerSnapshot(order = {}) {
  const firstName = cleanString(order.buyerFirstNameSnapshot);
  const lastName = cleanString(order.buyerLastNameSnapshot);

  const displayName =
    cleanString(order.buyerDisplayNameSnapshot) ||
    [firstName, lastName].filter(Boolean).join(" ");

  return {
    email: cleanEmail(order.buyerEmailSnapshot) || null,
    firstName,
    lastName,
    displayName,
  };
}

export function getOrderBuyerRecipient(order) {
  const buyer = getOrderBuyerSnapshot(order);

  return {
    email: buyer.email,
    name: buyer.displayName,
  };
}
