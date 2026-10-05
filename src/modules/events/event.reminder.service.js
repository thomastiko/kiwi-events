import { features } from "../../config/features.js";

import { EVENT_STATUSES } from "./event.constants.js";
import { executeMailBatch } from "../mail/mail.batch.service.js";
import {
  getEventReminderSession,
  getEventTimezone,
  isTomorrowInTimezone,
} from "./event.schedule.js";

import { listEvents } from "./repositories/event.repository.js";

import { sendEventReminderMailForOrderSafe } from "./event.mail.service.js";

import { findConfirmedOrdersWithActiveTicketsForEvent } from "./event.orderAudience.service.js";

function getReminderEventContext(event, now) {
  const session = getEventReminderSession(event);

  if (!session) {
    return null;
  }

  const timeZone = getEventTimezone(event, {
    session,
  });

  if (
    !isTomorrowInTimezone(session.startAt, {
      now,
      timeZone,
    })
  ) {
    return null;
  }

  return {
    event,
    session,
  };
}

function sortReminderContexts(contexts = []) {
  return [...contexts].sort(
    (left, right) =>
      new Date(left.session.startAt).getTime() -
      new Date(right.session.startAt).getTime(),
  );
}

function emptyResult({ reason, skipped = true } = {}) {
  return {
    success: true,
    skipped,
    reason: reason || null,
    eventsChecked: 0,
    ordersChecked: 0,
    sent: 0,
    skippedCount: 0,
    failed: 0,
  };
}

export async function sendTomorrowEventRemindersService({
  now = new Date(),
} = {}) {
  if (!features.mail) {
    return emptyResult({
      reason: "mail_feature_disabled",
    });
  }

  if (!features.mailEventReminder) {
    return emptyResult({
      reason: "mail_event_reminder_disabled",
    });
  }

  const events = await listEvents(
    {
      status: EVENT_STATUSES.PUBLISHED,
    },
    {
      lean: true,
    },
  );

  const reminderContexts = sortReminderContexts(
    events
      .filter((event) => !event.cancelledAt && !event.archivedAt)
      .map((event) => getReminderEventContext(event, now))
      .filter(Boolean),
  );

  let ordersChecked = 0;
  let sent = 0;
  let skippedCount = 0;
  let failed = 0;

  for (const { event, session } of reminderContexts) {
    const confirmedOrders = await findConfirmedOrdersWithActiveTicketsForEvent(
      event.id,
    );

    const batch = await executeMailBatch({
      items: confirmedOrders,

      getMetadata: (order) => ({
        orderId: order?.id || null,

        orderNumber: order?.orderNumber || null,
      }),

      worker: (order) =>
        sendEventReminderMailForOrderSafe({
          event,
          order,
          session,
        }),
    });

    ordersChecked += batch.totalCount;

    sent += batch.sentCount;

    skippedCount += batch.skippedCount;

    failed += batch.failedCount;
  }

  return {
    success: true,
    skipped: false,
    reason: null,

    eventsChecked: reminderContexts.length,

    ordersChecked,

    sent,

    skippedCount,

    failed,
  };
}
