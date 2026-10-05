import { createRateLimit } from "./rateLimit.middleware.js";

export const adminLoginRateLimit = createRateLimit({
  keyPrefix: "admin-login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  code: "ADMIN_LOGIN_RATE_LIMITED",
  title: "Too many login attempts",
  message: "Too many login attempts. Please try again later.",
  action: "Wait before trying to log in again.",
});

export const setupRateLimit = createRateLimit({
  keyPrefix: "setup",
  windowMs: 15 * 60 * 1000,
  max: 30,
  code: "SETUP_RATE_LIMITED",
  title: "Too many setup requests",
  message: "Too many setup requests. Please try again later.",
});

export const checkoutRateLimit = createRateLimit({
  keyPrefix: "checkout",
  windowMs: 10 * 60 * 1000,
  max: 60,
  code: "CHECKOUT_RATE_LIMITED",
  title: "Too many checkout requests",
  message: "Too many checkout requests. Please try again later.",
});

export const guestAccessRateLimit = createRateLimit({
  keyPrefix: "guest-access",
  windowMs: 10 * 60 * 1000,
  max: 60,
  code: "GUEST_ACCESS_RATE_LIMITED",
  title: "Too many guest access requests",
  message: "Too many guest access requests. Please try again later.",
});
export const guestAccessRecoveryRateLimit = createRateLimit({
  keyPrefix: "guest-access-recovery",
  windowMs: 10 * 60 * 1000,
  max: 20,
  code: "GUEST_ACCESS_RECOVERY_RATE_LIMITED",
  title: "Too many guest access recovery requests",
  message: "Too many guest access recovery requests. Please try again later.",
  action: "Wait before requesting another guest access link.",
});
export const paymentWebhookRateLimit = createRateLimit({
  keyPrefix: "payment-webhook",
  windowMs: 60 * 1000,
  max: 120,
  code: "PAYMENT_WEBHOOK_RATE_LIMITED",
  title: "Too many payment webhook requests",
  message: "Too many payment webhook requests. Please try again later.",
});
