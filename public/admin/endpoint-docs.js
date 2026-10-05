// Generated documentation source for the currently registered Kiwi Events API routes.
// Keep each HTTP method + path exactly once. Query parameters belong in descriptions, not in path strings.

export const ENDPOINT_GROUP_LABELS = Object.freeze({
  general: "General",
  setup: "Setup",
  authentication: "Authentication",
  eventUsers: "Event Users",
  eventRoles: "Event Roles",
  system: "System & Database",
  events: "Events",
  ticketTypes: "Ticket Types",
  discountCodes: "Discount Codes",
  orders: "Orders",
  tickets: "Tickets & Check-in",
  payments: "Payments",
  mail: "Mail",
  media: "Media & Storage",
});

export const ENDPOINT_GROUPS = {
  general: [
    {
      method: "GET",
      path: "/api/health",
      title: "Health check",
      description: "Returns backend health information.",
      auth: "Public",
    },
  ],

  setup: [
    {
      method: "GET",
      path: "/api/setup/status",
      title: "Setup status",
      description: "Returns whether Kiwi Events has already been initialized.",
      auth: "Public",
    },
    {
      method: "GET",
      path: "/api/setup/config",
      title: "Load setup config",
      description:
        "Loads the public setup configuration while initial setup is still open.",
      auth: "Setup only",
    },
    {
      method: "POST",
      path: "/api/setup/database/test",
      title: "Test setup database",
      description:
        "Tests database credentials during initial setup without saving them.",
      auth: "Setup only",
    },
    {
      method: "POST",
      path: "/api/setup/database/save",
      title: "Save setup database",
      description: "Saves the database configuration during initial setup.",
      auth: "Setup only",
    },
    {
      method: "POST",
      path: "/api/setup/initialize",
      title: "Initialize Kiwi Events",
      description:
        "Completes initial setup and creates the initial local admin configuration.",
      auth: "Setup only",
    },
  ],

  authentication: [
    {
      method: "POST",
      path: "/api/admin/auth/login",
      title: "Admin login",
      description:
        "Authenticates a local Kiwi Events admin account and returns an admin identity token.",
      auth: "Public",
    },
    {
      method: "GET",
      path: "/api/admin/auth/me",
      title: "Current admin",
      description: "Returns the currently authenticated local admin user.",
      auth: "Admin",
    },
  ],

  eventUsers: [
    {
      method: "GET",
      path: "/api/admin/event-users/me",
      title: "Current event user",
      description:
        "Returns the Kiwi Events staff profile linked to the current identity, if one exists.",
      auth: "Identity",
    },
    {
      method: "GET",
      path: "/api/admin/event-users/by-external-user/:provider/:externalUserId",
      title: "Get linked external user",
      description: "Returns the staff profile linked to a host-system user.",
      auth: "Admin",
    },
    {
      method: "PUT",
      path: "/api/admin/event-users/by-external-user/:provider/:externalUserId",
      title: "Upsert linked external user",
      description:
        "Creates or updates the staff profile linked to a host-system user.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/by-external-user/:provider/:externalUserId/deactivate",
      title: "Deactivate linked external user",
      description:
        "Deactivates the staff profile linked to a host-system user.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/by-external-user/:provider/:externalUserId/reactivate",
      title: "Reactivate linked external user",
      description:
        "Reactivates the staff profile linked to a host-system user.",
      auth: "Admin",
    },
    {
      method: "GET",
      path: "/api/admin/event-users",
      title: "List event users",
      description: "Lists Kiwi Events staff users.",
      auth: "Admin",
    },
    {
      method: "GET",
      path: "/api/admin/event-users/:id",
      title: "Get event user",
      description: "Loads one Kiwi Events staff user.",
      auth: "Admin",
    },
    {
      method: "POST",
      path: "/api/admin/event-users",
      title: "Create event user",
      description: "Creates a Kiwi Events staff user.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/:id",
      title: "Update event user",
      description: "Updates staff user profile, role or related settings.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/:id/profile-image",
      title: "Upload profile image",
      description:
        "Uploads or replaces a staff user profile image using multipart/form-data field image.",
      auth: "Admin",
    },
    {
      method: "DELETE",
      path: "/api/admin/event-users/:id/profile-image",
      title: "Delete profile image",
      description: "Deletes a staff user profile image.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/:id/deactivate",
      title: "Deactivate event user",
      description: "Deactivates a Kiwi Events staff user.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-users/:id/reactivate",
      title: "Reactivate event user",
      description: "Reactivates a Kiwi Events staff user.",
      auth: "Admin",
    },
    {
      method: "DELETE",
      path: "/api/admin/event-users/:id",
      title: "Delete event user",
      description: "Deletes a Kiwi Events staff user.",
      auth: "Admin",
    },
  ],

  eventRoles: [
    {
      method: "GET",
      path: "/api/admin/event-roles/permission-groups",
      title: "List permission groups",
      description: "Returns the available event-role permission groups.",
      auth: "Admin",
    },
    {
      method: "GET",
      path: "/api/admin/event-roles",
      title: "List event roles",
      description: "Lists configured event roles.",
      auth: "Admin",
    },
    {
      method: "GET",
      path: "/api/admin/event-roles/:key",
      title: "Get event role",
      description: "Loads one event role by key.",
      auth: "Admin",
    },
    {
      method: "POST",
      path: "/api/admin/event-roles",
      title: "Create event role",
      description: "Creates a custom event role.",
      auth: "Admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/event-roles/:key",
      title: "Update event role",
      description: "Updates a custom event role.",
      auth: "Admin",
    },
    {
      method: "DELETE",
      path: "/api/admin/event-roles/:key",
      title: "Delete event role",
      description: "Deletes a custom event role when allowed.",
      auth: "Admin",
    },
  ],

  system: [
    {
      method: "GET",
      path: "/api/admin/system/config",
      title: "Load system config",
      description:
        "Returns the current runtime configuration and secret-status metadata.",
      auth: "System admin",
    },
    {
      method: "PATCH",
      path: "/api/admin/system/config",
      title: "Update system config",
      description:
        "Updates runtime configuration such as features, branding, mail, storage, payments and security settings.",
      auth: "System admin",
    },
    {
      method: "GET",
      path: "/api/admin/system/database/status",
      title: "Database status",
      description:
        "Returns the active database provider and connection status.",
      auth: "System admin",
    },
    {
      method: "POST",
      path: "/api/admin/system/database/test",
      title: "Test database connection",
      description:
        "Tests a database provider and connection settings without switching.",
      auth: "System admin",
    },
    {
      method: "POST",
      path: "/api/admin/system/database/switch",
      title: "Switch database",
      description:
        "Switches the active database provider and connection. Data is not migrated automatically.",
      auth: "System admin",
    },
    {
      method: "POST",
      path: "/api/admin/system/reset",
      title: "Reset Kiwi Events",
      description:
        "Resets Kiwi Events according to the supplied reset confirmation and options.",
      auth: "System admin",
    },
    {
      method: "POST",
      path: "/api/admin/system/restart",
      title: "Restart Kiwi Events",
      description: "Requests a graceful application restart.",
      auth: "System admin",
    },
  ],

  events: [
    {
      method: "GET",
      path: "/api/public/events",
      title: "List public events",
      description: "Lists public events available to frontend integrations.",
      auth: "Public",
    },
    {
      method: "GET",
      path: "/api/public/events/slug/:slug",
      title: "Get public event by slug",
      description: "Loads a public event by slug.",
      auth: "Public",
    },
    {
      method: "GET",
      path: "/api/public/events/id/:id",
      title: "Get public event by id",
      description: "Loads a public event by id.",
      auth: "Public",
    },
    {
      method: "GET",
      path: "/api/admin/events",
      title: "List admin events",
      description: "Lists events available to the current event manager.",
      auth: "Event manager",
    },
    {
      method: "GET",
      path: "/api/admin/events/:id/refund-preview",
      title: "Event refund preview",
      description: "Calculates the refund impact for cancelling the event.",
      auth: "Event manager",
    },
    {
      method: "GET",
      path: "/api/admin/events/:id/ticket-template",
      title: "Get ticket template",
      description: "Loads the effective ticket PDF template for an event.",
      auth: "Event manager",
    },
    {
      method: "PUT",
      path: "/api/admin/events/:id/ticket-template",
      title: "Save ticket template",
      description:
        "Creates or replaces the event-specific ticket PDF template.",
      auth: "Event manager",
    },
    {
      method: "DELETE",
      path: "/api/admin/events/:id/ticket-template",
      title: "Reset ticket template",
      description:
        "Removes the event-specific ticket template and falls back to the default template.",
      auth: "Event manager",
    },
    {
      method: "POST",
      path: "/api/admin/events/:id/ticket-template/images",
      title: "Upload ticket-template image",
      description:
        "Uploads an image asset for the event ticket template using multipart/form-data field image.",
      auth: "Event manager",
    },
    {
      method: "DELETE",
      path: "/api/admin/events/:id/ticket-template/images/:assetId",
      title: "Delete ticket-template image",
      description: "Deletes an image asset used by the event ticket template.",
      auth: "Event manager",
    },
    {
      method: "GET",
      path: "/api/admin/events/:id",
      title: "Get admin event",
      description: "Loads one event for internal management.",
      auth: "Event manager",
    },
    {
      method: "POST",
      path: "/api/admin/events/:id/images",
      title: "Upload event images",
      description:
        "Uploads one or more event images using multipart/form-data fields image or images.",
      auth: "Event manager",
    },
    {
      method: "DELETE",
      path: "/api/admin/events/:id/images/:assetId",
      title: "Delete event image",
      description: "Removes an image asset from an event.",
      auth: "Event manager",
    },
    {
      method: "POST",
      path: "/api/admin/events",
      title: "Create event",
      description: "Creates a new event. Supports multipart event data.",
      auth: "Event manager",
    },
    {
      method: "PATCH",
      path: "/api/admin/events/:id",
      title: "Update event",
      description: "Updates an event. Supports multipart event data.",
      auth: "Event manager",
    },
    {
      method: "PATCH",
      path: "/api/admin/events/:id/feature",
      title: "Feature event",
      description: "Updates the featured state of an event.",
      auth: "Event manager",
    },
    {
      method: "DELETE",
      path: "/api/admin/events/:id",
      title: "Delete event",
      description: "Deletes an event when deletion is allowed.",
      auth: "Event manager",
    },
    {
      method: "PATCH",
      path: "/api/admin/events/:id/archive",
      title: "Archive event",
      description: "Archives an event.",
      auth: "Event manager",
    },
    {
      method: "PATCH",
      path: "/api/admin/events/:id/publish",
      title: "Publish event",
      description: "Publishes an event.",
      auth: "Event manager",
    },
    {
      method: "POST",
      path: "/api/admin/events/:id/custom-mail",
      title: "Send custom event mail",
      description:
        "Sends a custom mail to an event audience and supports multipart attachments.",
      auth: "Event manager",
    },
    {
      method: "PATCH",
      path: "/api/admin/events/:id/cancel",
      title: "Cancel event",
      description:
        "Cancels an event and runs the configured cancellation/refund workflow.",
      auth: "Event manager",
    },
  ],

  ticketTypes: [
    {
      method: "GET",
      path: "/api/public/ticket-types",
      title: "List public ticket types",
      description:
        "Lists ticket types available to public frontend integrations.",
      auth: "Public",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/public/ticket-types/:id",
      title: "Get public ticket type",
      description: "Loads one public ticket type.",
      auth: "Public",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/ticket-types",
      title: "List admin ticket types",
      description: "Lists ticket types available to the current event manager.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/ticket-types/:id",
      title: "Get admin ticket type",
      description: "Loads one ticket type for internal management.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/ticket-types",
      title: "Create ticket type",
      description: "Creates a ticket type for an event.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/admin/ticket-types/:id",
      title: "Update ticket type",
      description: "Updates a ticket type.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "DELETE",
      path: "/api/admin/ticket-types/:id",
      title: "Delete ticket type",
      description: "Deletes a ticket type.",
      auth: "Event manager",
      features: ["ticketing"],
    },
  ],

  discountCodes: [
    {
      method: "GET",
      path: "/api/admin/discount-codes/groups",
      title: "List discount-code groups",
      description:
        "Lists discount-code groups, typically filtered by eventId query parameter.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "POST",
      path: "/api/admin/discount-codes/groups",
      title: "Create discount-code group",
      description: "Creates a discount-code group for an event.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "PATCH",
      path: "/api/admin/discount-codes/groups/:groupId",
      title: "Update discount-code group",
      description: "Updates a discount-code group.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "DELETE",
      path: "/api/admin/discount-codes/groups/:groupId",
      title: "Delete discount-code group",
      description: "Deletes a discount-code group and its codes.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "GET",
      path: "/api/admin/discount-codes/groups/:groupId/codes",
      title: "List discount codes",
      description: "Lists the discount codes belonging to a group.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "POST",
      path: "/api/admin/discount-codes/groups/:groupId/codes",
      title: "Create discount codes",
      description:
        "Creates supplied codes or generates multiple codes for a group.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "PATCH",
      path: "/api/admin/discount-codes/:codeId",
      title: "Update discount code",
      description: "Updates a discount code.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
    {
      method: "DELETE",
      path: "/api/admin/discount-codes/:codeId",
      title: "Delete discount code",
      description: "Deletes a discount code.",
      auth: "Event manager",
      features: ["ticketing", "discountCodes"],
    },
  ],

  orders: [
    {
      method: "GET",
      path: "/api/public/orders/guest/:id",
      title: "Get guest order",
      description: "Loads a guest order using its secret access token.",
      auth: "Guest access token",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/public/orders/guest/:id/cancel",
      title: "Cancel guest order",
      description:
        "Cancels a guest order using its secret access token when cancellation is allowed.",
      auth: "Guest access token",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/public/orders/checkout",
      title: "Checkout",
      description:
        "Creates a checkout order. Guest checkout still requires a host/service identity as the technical caller.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/public/orders/guest-access/reissue",
      title: "Reissue guest access",
      description:
        "Reissues guest-order access through an authenticated host service.",
      auth: "Host service",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/public/orders",
      title: "List own orders",
      description: "Lists orders belonging to the authenticated external user.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/public/orders/:id",
      title: "Get own order",
      description:
        "Loads one order belonging to the authenticated external user.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/public/orders/:id/cancel",
      title: "Cancel own order",
      description:
        "Cancels an authenticated user order when cancellation is allowed.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/orders/event/:eventId",
      title: "List event orders",
      description: "Lists orders for an event.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/orders/event/:eventId/manual",
      title: "Create manual order",
      description: "Creates a manual/internal order for an event.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/admin/orders/:id/cancel",
      title: "Cancel internal order",
      description:
        "Cancels an order from the internal event-management interface.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/admin/orders/:id/buyer",
      title: "Update order buyer",
      description: "Updates buyer/contact data on an internal order.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/orders/:id/mails/resend",
      title: "Resend order mail",
      description: "Resends the order mail for an internal order.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/orders/:id/refund",
      title: "Refund order",
      description:
        "Refunds an eligible order using the configured payment workflow.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/orders/:id",
      title: "Get internal order",
      description: "Loads one order for internal event management.",
      auth: "Event manager",
      features: ["ticketing"],
    },
  ],

  tickets: [
    {
      method: "GET",
      path: "/api/public/tickets/guest/:id/qr",
      title: "Get guest ticket QR",
      description:
        "Returns a guest ticket QR using the secret guest access token.",
      auth: "Guest access token",
      features: ["ticketing", "ticketQr"],
    },
    {
      method: "GET",
      path: "/api/public/tickets/guest/:id/document",
      title: "Download guest ticket PDF",
      description:
        "Downloads a guest ticket PDF using the secret guest access token.",
      auth: "Guest access token",
      features: ["ticketing", "ticketPdf"],
    },
    {
      method: "GET",
      path: "/api/public/tickets",
      title: "List own tickets",
      description:
        "Lists tickets belonging to the authenticated external user.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/public/tickets/:id/qr",
      title: "Get own ticket QR",
      description: "Returns the QR data for an authenticated user ticket.",
      auth: "Identity",
      features: ["ticketing", "ticketQr"],
    },
    {
      method: "GET",
      path: "/api/public/tickets/:id/document",
      title: "Download own ticket PDF",
      description:
        "Downloads the generated PDF for an authenticated user ticket.",
      auth: "Identity",
      features: ["ticketing", "ticketPdf"],
    },
    {
      method: "GET",
      path: "/api/public/tickets/:id",
      title: "Get own ticket",
      description:
        "Loads one ticket belonging to the authenticated external user.",
      auth: "Identity",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/tickets/check-in/lookup",
      title: "Check-in lookup",
      description: "Looks up and previews a ticket before check-in.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/tickets/check-in/confirm",
      title: "Confirm check-in",
      description: "Confirms check-in for a previously looked-up ticket.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/tickets/check-in/qr/lookup",
      title: "QR check-in lookup",
      description: "Looks up and previews a ticket from its QR payload.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "POST",
      path: "/api/admin/tickets/check-in/qr/confirm",
      title: "QR check-in confirm",
      description: "Confirms check-in from a QR payload.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/tickets/event/:eventId",
      title: "List event tickets",
      description: "Lists tickets/attendees for an event.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "GET",
      path: "/api/admin/tickets/:id",
      title: "Get internal ticket",
      description: "Loads one ticket for internal management or check-in.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/admin/tickets/:id/cancel",
      title: "Cancel ticket",
      description: "Cancels an individual ticket.",
      auth: "Event manager",
      features: ["ticketing"],
    },
    {
      method: "PATCH",
      path: "/api/admin/tickets/:id/check-in",
      title: "Set ticket check-in",
      description: "Sets or updates the check-in state of a ticket.",
      auth: "Event manager or check-in staff",
      features: ["ticketing"],
    },
  ],

  payments: [
    {
      method: "POST",
      path: "/api/webhooks/payments/:provider",
      title: "Payment webhook",
      description:
        "Receives payment-provider webhook callbacks for supported providers.",
      auth: "Provider webhook",
    },
  ],

  mail: [
    {
      method: "GET",
      path: "/api/admin/mail/templates",
      title: "List mail templates",
      description: "Lists configured mail templates.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "POST",
      path: "/api/admin/mail/templates",
      title: "Create mail template",
      description: "Creates a mail template.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "GET",
      path: "/api/admin/mail/templates/:id",
      title: "Get mail template",
      description: "Loads one mail template.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "PATCH",
      path: "/api/admin/mail/templates/:id",
      title: "Update mail template",
      description: "Updates a mail template.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "DELETE",
      path: "/api/admin/mail/templates/:id",
      title: "Delete mail template",
      description: "Deletes a mail template.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "POST",
      path: "/api/admin/mail/templates/:id/test",
      title: "Send test mail",
      description: "Sends a test message rendered from a mail template.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "GET",
      path: "/api/admin/mail/logs",
      title: "List mail logs",
      description: "Lists mail-delivery logs.",
      auth: "Admin",
      features: ["mail"],
    },
    {
      method: "GET",
      path: "/api/admin/mail/logs/:id",
      title: "Get mail log",
      description: "Loads one mail-delivery log.",
      auth: "Admin",
      features: ["mail"],
    },
  ],

  media: [
    {
      method: "GET",
      path: "/api/admin/media-assets/events",
      title: "List global event media",
      description: "Lists event image assets across all events.",
      auth: "Global event manager",
    },
    {
      method: "DELETE",
      path: "/api/admin/media-assets/events/:id",
      title: "Delete global event media",
      description:
        "Deletes an event image asset from the global media catalog.",
      auth: "Global event manager",
    },
    {
      method: "GET",
      path: "/api/public/media-assets/:id/file",
      title: "Download public media asset",
      description: "Streams a public media asset file by asset id.",
      auth: "Public",
    },
  ],
};

export const ENDPOINTS = Object.values(ENDPOINT_GROUPS).flat();
export const ENDPOINT_COUNT = ENDPOINTS.length;
