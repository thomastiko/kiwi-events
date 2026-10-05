export async function up(knex) {
  await knex.schema.createTable("event_roles", (table) => {
    table.string("key", 64).primary();

    table.string("name", 120).notNullable();
    table.text("description").nullable();
    table.json("permissions").notNullable();

    table.boolean("is_protected").notNullable().defaultTo(false);
    table.integer("sort_order").notNullable().defaultTo(100);

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["is_protected"]);
    table.index(["sort_order"]);
  });

  await knex.schema.createTable("event_users", (table) => {
    table.string("id", 36).primary();

    table.string("auth_provider", 32).notNullable().defaultTo("external");

    table.string("email_snapshot", 320).notNullable();
    table.string("local_email_unique_key", 320).nullable();
    table.string("password_hash", 512).nullable();

    table.string("external_provider", 128).nullable();
    table.string("external_user_id", 191).nullable();

    table.string("first_name_snapshot", 191).nullable();
    table.string("last_name_snapshot", 191).nullable();

    table.text("profile_bio").nullable();
    table.string("profile_image_asset_id", 64).nullable();

    table.string("role", 64).nullable().defaultTo("event_manager");

    table.boolean("must_change_password").notNullable().defaultTo(false);
    table.timestamp("last_login_at", { useTz: false }).nullable();

    table.boolean("is_active").notNullable().defaultTo(true);
    table.text("notes").nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["role"]);
    table.index(["email_snapshot"]);
    table.index(["auth_provider"]);
    table.unique(["local_email_unique_key"], "uq_event_users_local_email");
    table.unique(
      ["external_provider", "external_user_id"],
      "uq_event_users_external_identity",
    );
    table.index(["is_active"]);

    table
      .foreign("role", "fk_event_users_role")
      .references("key")
      .inTable("event_roles")
      .onUpdate("RESTRICT")
      .onDelete("SET NULL");
  });

  await knex.schema.createTable("media_assets", (table) => {
    table.string("id", 36).primary();

    table.string("kind", 100).notNullable();
    table.string("folder", 300).notNullable();
    table.string("storage_key", 700).notNullable();
    table.string("storage_target", 20).notNullable();
    table.string("filename_original", 500).notNullable().defaultTo("");
    table.string("mime_type", 200).notNullable().defaultTo("");
    table.bigInteger("size").notNullable().defaultTo(0);

    table.string("owner_event_id", 36).nullable();
    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["storage_target", "storage_key"],
      "uq_media_assets_storage_target_key",
    );
    table.index(["kind"], "idx_media_assets_kind");
    table.index(["owner_event_id"], "idx_media_assets_owner_event_id");
    table.index(
      ["created_by_event_user_id"],
      "idx_media_assets_created_by_event_user_id",
    );
    table.index(
      ["updated_by_event_user_id"],
      "idx_media_assets_updated_by_event_user_id",
    );
  });

  await knex.schema.createTable("events", (table) => {
    table.string("id", 36).primary();

    table.string("title", 200).notNullable();
    table.string("slug", 250).notNullable();

    table.string("short_description", 500).notNullable().defaultTo("");
    table.text("description").notNullable();

    table.string("category", 100).notNullable();
    table.string("status", 100).notNullable().defaultTo("draft");
    table.string("visibility", 100).notNullable().defaultTo("public");

    table.string("location", 500).notNullable().defaultTo("");
    table.json("image_asset_ids").nullable();

    table.boolean("is_free").notNullable().defaultTo(true);
    table.timestamp("sales_start_at", { useTz: false }).nullable();
    table.timestamp("sales_end_at", { useTz: false }).nullable();

    table.boolean("is_featured").notNullable().defaultTo(false);
    table.integer("featured_order").notNullable().defaultTo(0);

    table.text("notes_internal").notNullable();

    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table.timestamp("published_at", { useTz: false }).nullable();
    table.timestamp("cancelled_at", { useTz: false }).nullable();
    table.string("cancellation_reason", 1000).nullable();
    table.boolean("is_cancellation_finalized").notNullable().defaultTo(false);
    table.timestamp("cancellation_finalized_at", { useTz: false }).nullable();
    table.timestamp("archived_at", { useTz: false }).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["slug"], "uq_events_slug");
    table.index(["category"], "idx_events_category");
    table.index(["status"], "idx_events_status");
    table.index(["visibility"], "idx_events_visibility");
    table.index(
      ["category", "status", "visibility"],
      "idx_events_category_status_visibility",
    );
    table.index(["featured_order"], "idx_events_featured_order");
    table.index(["published_at"], "idx_events_published_at");
    table.index(
      ["is_cancellation_finalized"],
      "idx_events_is_cancellation_finalized",
    );
    table.index(
      ["created_by_event_user_id"],
      "idx_events_created_by_event_user_id",
    );
    table.index(
      ["updated_by_event_user_id"],
      "idx_events_updated_by_event_user_id",
    );
  });

  await knex.schema.createTable("event_sessions", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");

    table.timestamp("start_at", { useTz: false }).notNullable();
    table.timestamp("end_at", { useTz: false }).notNullable();
    table.string("timezone", 100).notNullable().defaultTo("Europe/Vienna");
    table.string("location_label", 500).notNullable().defaultTo("");
    table.text("location_details").notNullable();
    table.integer("capacity").nullable();
    table.string("status", 100).notNullable().defaultTo("scheduled");
    table.integer("sort_order").notNullable().defaultTo(0);

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["event_id"], "idx_event_sessions_event_id");
    table.index(["start_at"], "idx_event_sessions_start_at");
    table.index(["end_at"], "idx_event_sessions_end_at");
    table.index(["status"], "idx_event_sessions_status");
  });

  await knex.schema.createTable("event_faqs", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");
    table.string("question", 300).notNullable();
    table.text("answer").notNullable();
    table.integer("sort_order").notNullable().defaultTo(0);

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["event_id"], "idx_event_faqs_event_id");
    table.index(["sort_order"], "idx_event_faqs_sort_order");
  });

  await knex.schema.createTable("event_tags", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");
    table.string("tag", 100).notNullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["event_id", "tag"], "uq_event_tags_event_id_tag");
    table.index(["tag"], "idx_event_tags_tag");
  });

  await knex.schema.createTable("ticket_types", (table) => {
    table.string("id", 36).primary();

    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");

    table.string("name", 150).notNullable();
    table.string("display_name", 150).notNullable();
    table.text("description").notNullable();

    table.string("status", 50).notNullable().defaultTo("active");
    table.string("ticket_kind", 50).notNullable().defaultTo("normal");
    table.string("pricing_mode", 50).notNullable();

    table.integer("price_gross").notNullable().defaultTo(0);
    table.string("currency", 10).notNullable().defaultTo("EUR");

    table.integer("stock_total").nullable();
    table.integer("stock_sold").notNullable().defaultTo(0);

    table.integer("min_per_order").notNullable().defaultTo(1);
    table.integer("max_per_order").nullable();

    table.timestamp("sales_start_at", { useTz: false }).nullable();
    table.timestamp("sales_end_at", { useTz: false }).nullable();

    table.boolean("is_personalized").notNullable().defaultTo(false);
    table.integer("sort_order").notNullable().defaultTo(0);

    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["event_id"], "idx_ticket_types_event_id");
    table.index(
      ["event_id", "sort_order", "created_at"],
      "idx_ticket_types_event_sort_created",
    );
    table.index(["event_id", "ticket_kind"], "idx_ticket_types_event_kind");
    table.index(["status"], "idx_ticket_types_status");
    table.index(["ticket_kind"], "idx_ticket_types_kind");
    table.index(["pricing_mode"], "idx_ticket_types_pricing_mode");
    table.index(
      ["created_by_event_user_id"],
      "idx_ticket_types_created_by_event_user",
    );
    table.index(
      ["updated_by_event_user_id"],
      "idx_ticket_types_updated_by_event_user",
    );
  });

  await knex.schema.createTable("ticket_type_sessions", (table) => {
    table.string("id", 36).primary();
    table
      .string("ticket_type_id", 36)
      .notNullable()
      .references("id")
      .inTable("ticket_types")
      .onDelete("CASCADE");
    table
      .string("event_session_id", 36)
      .notNullable()
      .references("id")
      .inTable("event_sessions")
      .onDelete("CASCADE");

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["ticket_type_id", "event_session_id"],
      "uq_ticket_type_sessions_type_session",
    );
    table.index(
      ["event_session_id"],
      "idx_ticket_type_sessions_event_session_id",
    );
  });

  await knex.schema.createTable("orders", (table) => {
    table.string("id", 36).primary();

    table.string("order_number", 100).notNullable();
    table.string("idempotency_scope", 300).nullable();
    table.string("idempotency_key", 200).nullable();
    table.string("idempotency_request_hash", 64).nullable();
    table.timestamp("idempotency_completed_at", { useTz: false }).nullable();

    table.string("host_service_provider", 100).nullable();
    table.string("host_service_id", 200).nullable();

    table.string("buyer_type", 50).notNullable().defaultTo("guest");
    table.string("buyer_external_provider", 100).nullable();
    table.string("buyer_external_user_id", 200).nullable();
    table.string("buyer_email_snapshot", 320).notNullable().defaultTo("");
    table.string("buyer_first_name_snapshot", 100).notNullable().defaultTo("");
    table.string("buyer_last_name_snapshot", 100).notNullable().defaultTo("");
    table
      .string("buyer_display_name_snapshot", 220)
      .notNullable()
      .defaultTo("");
    table.json("buyer_raw_external_snapshot").nullable();

    table.string("guest_access_token_hash", 255).nullable();
    table
      .timestamp("guest_access_token_expires_at", { useTz: false })
      .nullable();
    table.timestamp("guest_access_last_used_at", { useTz: false }).nullable();
    table.integer("guest_access_download_count").notNullable().defaultTo(0);

    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("RESTRICT");
    table.text("event_title_snapshot").notNullable();
    table.string("event_slug_snapshot", 250).nullable();
    table.string("event_category_snapshot", 100).nullable();
    table.text("event_location_snapshot").nullable();
    table.timestamp("event_starts_at_snapshot", { useTz: false }).nullable();
    table
      .string("event_timezone_snapshot", 100)
      .notNullable()
      .defaultTo("Europe/Vienna");

    table.json("items").notNullable();

    table.string("currency", 10).notNullable().defaultTo("EUR");
    table.integer("subtotal").notNullable().defaultTo(0);

    table.string("discount_code_id_snapshot", 100).nullable();
    table.string("discount_code_snapshot", 64).nullable();
    table.string("discount_code_group_id_snapshot", 100).nullable();
    table.string("discount_code_group_name_snapshot", 150).nullable();
    table.integer("discount_percent").unsigned().nullable();
    table.integer("discount_amount").unsigned().notNullable().defaultTo(0);

    table.integer("total_price").notNullable().defaultTo(0);

    table.string("status", 50).notNullable().defaultTo("pending");
    table.string("payment_status", 50).notNullable().defaultTo("pending");
    table.string("payment_provider", 100).nullable().defaultTo("none");
    table.string("payment_provider_payment_id", 300).nullable();
    table.text("payment_checkout_url").nullable();

    table
      .string("fulfillment_status", 50)
      .notNullable()
      .defaultTo("not_started");
    table.string("fulfillment_step", 50).nullable();
    table.integer("fulfillment_attempt_count").notNullable().defaultTo(0);
    table.timestamp("fulfillment_started_at", { useTz: false }).nullable();
    table.timestamp("fulfillment_completed_at", { useTz: false }).nullable();
    table.timestamp("fulfillment_failed_at", { useTz: false }).nullable();
    table.text("fulfillment_last_error").nullable();
    table.string("fulfillment_lease_token", 36).nullable();
    table
      .timestamp("fulfillment_lease_expires_at", { useTz: false })
      .nullable();
    table.timestamp("fulfillment_next_retry_at", { useTz: false }).nullable();
    table
      .timestamp("fulfillment_manual_review_at", { useTz: false })
      .nullable();

    table.timestamp("payment_started_at", { useTz: false }).nullable();
    table
      .string("payment_initialization_status", 50)
      .notNullable()
      .defaultTo("not_started");
    table
      .timestamp("payment_initialization_failed_at", { useTz: false })
      .nullable();
    table.string("payment_initialization_error", 1000).nullable();
    table.timestamp("paid_at", { useTz: false }).nullable();

    table.timestamp("refunded_at", { useTz: false, precision: 3 }).nullable();
    table.string("refund_status", 50).notNullable().defaultTo("none");
    table.string("refund_reason", 1000).nullable();
    table.integer("refunded_amount").notNullable().defaultTo(0);
    table.string("payment_provider_refund_id", 300).nullable();
    table
      .timestamp("refund_failed_at", { useTz: false, precision: 3 })
      .nullable();
    table.string("refund_failure_reason", 1000).nullable();

    table.string("source", 50).notNullable().defaultTo("public");
    table.string("manual_assignment_reason", 1000).nullable();

    table.timestamp("expires_at", { useTz: false }).nullable();
    table.timestamp("confirmed_at", { useTz: false }).nullable();
    table.timestamp("cancelled_at", { useTz: false }).nullable();
    table.timestamp("expired_at", { useTz: false }).nullable();
    table.string("cancellation_reason", 1000).nullable();

    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();
    table.json("metadata").nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["order_number"], "uq_orders_order_number");
    table.unique(
      ["idempotency_scope", "idempotency_key"],
      "uq_orders_idempotency",
    );
    table.index(
      ["host_service_provider", "host_service_id", "created_at"],
      "idx_orders_host_service_created",
    );
    table.index(
      ["buyer_external_provider", "buyer_external_user_id", "created_at"],
      "idx_orders_external_buyer_created",
    );
    table.index(
      ["buyer_email_snapshot", "created_at"],
      "idx_orders_buyer_email_created",
    );
    table.index(["buyer_type", "created_at"], "idx_orders_buyer_type_created");
    table.index(
      ["event_id", "status", "created_at"],
      "idx_orders_event_status_created",
    );
    table.index(
      ["event_id", "payment_status", "created_at"],
      "idx_orders_event_payment_created",
    );
    table.index(
      ["payment_status", "status"],
      "idx_orders_payment_status_status",
    );
    table.index(
      ["payment_provider", "payment_provider_payment_id"],
      "idx_orders_payment_provider_payment_id",
    );
    table.index(["status", "expires_at"], "idx_orders_status_expires_at");
    table.index(
      ["payment_initialization_status", "expires_at"],
      "idx_orders_payment_init_status_expires_at",
    );
    table.index(
      ["event_id", "payment_status", "refund_status", "created_at"],
      "idx_orders_event_payment_refund_created",
    );
    table.index(
      ["created_by_event_user_id", "created_at"],
      "idx_orders_created_by_event_user",
    );
    table.index(
      ["updated_by_event_user_id", "updated_at"],
      "idx_orders_updated_by_event_user",
    );
    table.index(
      [
        "status",
        "payment_status",
        "fulfillment_status",
        "fulfillment_next_retry_at",
      ],
      "idx_orders_fulfillment_retry_due",
    );
    table.index(
      [
        "status",
        "payment_status",
        "fulfillment_status",
        "fulfillment_lease_expires_at",
      ],
      "idx_orders_fulfillment_stale_lease",
    );
    table.index(
      ["guest_access_token_hash"],
      "idx_orders_guest_access_token_hash",
    );
  });

  await knex.schema.createTable("tickets", (table) => {
    table.string("id", 36).primary();
    table.string("ticket_code", 120).notNullable();

    table
      .string("order_id", 36)
      .notNullable()
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");
    table.integer("order_item_index").notNullable();
    table.integer("order_item_unit_index").notNullable();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("RESTRICT");
    table
      .string("ticket_type_id", 36)
      .notNullable()
      .references("id")
      .inTable("ticket_types")
      .onDelete("RESTRICT");

    table.string("buyer_type", 50).notNullable().defaultTo("guest");
    table.string("buyer_external_provider", 100).nullable();
    table.string("buyer_external_user_id", 200).nullable();
    table.string("buyer_email_snapshot", 320).notNullable().defaultTo("");
    table.string("buyer_first_name_snapshot", 100).notNullable().defaultTo("");
    table.string("buyer_last_name_snapshot", 100).notNullable().defaultTo("");
    table
      .string("buyer_display_name_snapshot", 220)
      .notNullable()
      .defaultTo("");

    table.string("holder_type", 50).notNullable().defaultTo("buyer");
    table.string("holder_external_provider", 100).nullable();
    table.string("holder_external_user_id", 200).nullable();
    table.string("holder_email_snapshot", 320).notNullable().defaultTo("");
    table.string("holder_first_name_snapshot", 100).notNullable().defaultTo("");
    table.string("holder_last_name_snapshot", 100).notNullable().defaultTo("");
    table
      .string("holder_display_name_snapshot", 220)
      .notNullable()
      .defaultTo("");

    table.text("event_title_snapshot").notNullable();
    table.string("event_slug_snapshot", 250).nullable();
    table.string("event_category_snapshot", 100).nullable();
    table.timestamp("event_starts_at_snapshot", { useTz: false }).nullable();

    table.string("ticket_type_name_snapshot", 200).notNullable();
    table.text("ticket_type_description_snapshot").nullable();
    table.string("ticket_kind", 50).notNullable().defaultTo("normal");

    table.integer("unit_price").notNullable().defaultTo(0);
    table.string("currency", 10).notNullable().defaultTo("EUR");
    table.string("status", 50).notNullable().defaultTo("active");

    table.timestamp("checked_in_at", { useTz: false }).nullable();
    table.string("checked_in_by_event_user_id", 36).nullable();
    table.timestamp("cancelled_at", { useTz: false }).nullable();
    table.string("cancellation_reason", 1000).nullable();

    table.string("check_in_token_hash", 128).nullable();
    table.string("encrypted_check_in_token", 2000).nullable();
    table.integer("check_in_payload_version").notNullable().defaultTo(1);
    table.timestamp("check_in_token_created_at", { useTz: false }).nullable();
    table.timestamp("check_in_token_rotated_at", { useTz: false }).nullable();
    table.timestamp("check_in_token_last_used_at", { useTz: false }).nullable();

    table.string("ticket_pdf_storage_key", 700).nullable();
    table.string("ticket_pdf_storage_target", 20).nullable();
    table.timestamp("ticket_pdf_generated_at", { useTz: false }).nullable();

    table
      .string("deposit_refund_status", 50)
      .notNullable()
      .defaultTo("not_required");
    table.integer("deposit_refund_amount").notNullable().defaultTo(0);
    table.string("deposit_refund_currency", 10).notNullable().defaultTo("EUR");
    table.string("deposit_refund_provider_refund_id", 300).nullable();
    table.timestamp("deposit_refund_triggered_at", { useTz: false }).nullable();
    table.string("deposit_refund_triggered_by_event_user_id", 36).nullable();
    table.string("deposit_refund_failure_reason", 1000).nullable();

    table.json("metadata").nullable();
    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["ticket_code"], "uq_tickets_ticket_code");
    table.unique(
      ["order_id", "order_item_index", "order_item_unit_index"],
      "uq_tickets_order_item_unit",
    );
    table.unique(["check_in_token_hash"], "uq_tickets_check_in_token_hash");
    table.index(["order_id"], "idx_tickets_order_id");
    table.index(
      ["event_id", "status", "created_at"],
      "idx_tickets_event_status_created",
    );
    table.index(["ticket_type_id", "status"], "idx_tickets_ticket_type_status");
    table.index(
      ["buyer_external_provider", "buyer_external_user_id", "created_at"],
      "idx_tickets_external_buyer_created",
    );
    table.index(
      ["buyer_email_snapshot", "created_at"],
      "idx_tickets_buyer_email_created",
    );
    table.index(
      ["holder_external_provider", "holder_external_user_id", "created_at"],
      "idx_tickets_external_holder_created",
    );
    table.index(
      ["holder_email_snapshot", "created_at"],
      "idx_tickets_holder_email_created",
    );
    table.index(["buyer_type", "created_at"], "idx_tickets_buyer_type_created");
    table.index(["event_id", "ticket_kind"], "idx_tickets_event_kind");
    table.index(
      ["event_id", "deposit_refund_status"],
      "idx_tickets_event_deposit_refund",
    );
    table.index(
      ["event_id", "ticket_pdf_storage_target", "ticket_pdf_storage_key"],
      "idx_tickets_event_pdf_storage",
    );
    table.index(
      ["created_by_event_user_id", "created_at"],
      "idx_tickets_created_by_event_user",
    );
    table.index(
      ["updated_by_event_user_id", "updated_at"],
      "idx_tickets_updated_by_event_user",
    );
  });

  await knex.schema.createTable("email_templates", (table) => {
    table.string("id", 36).primary();
    table.string("template_key", 200).notNullable();
    table.string("module", 100).notNullable();
    table.string("category", 100).notNullable().defaultTo("");
    table.string("name", 300).notNullable();
    table.text("description").notNullable();
    table.text("subject").notNullable();
    table.text("html").notNullable();
    table.text("text").notNullable();
    table.json("variables").notNullable();
    table.string("from_name", 300).notNullable().defaultTo("");
    table.string("from_email", 320).notNullable().defaultTo("");
    table.string("reply_to", 320).notNullable().defaultTo("");
    table.string("status", 50).notNullable().defaultTo("active");
    table.boolean("is_system").notNullable().defaultTo(false);
    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["template_key"], "uq_email_templates_template_key");
    table.index(["module", "status"], "idx_email_templates_module_status");
    table.index(["category", "status"], "idx_email_templates_category_status");
    table.index(["is_system"], "idx_email_templates_is_system");
  });

  await knex.schema.createTable("email_logs", (table) => {
    table.string("id", 36).primary();
    table.string("template_key", 200).notNullable().defaultTo("");
    table.string("template_id", 36).nullable();
    table.string("module", 100).notNullable().defaultTo("");
    table.string("to_email", 320).notNullable();
    table.string("to_name", 300).notNullable().defaultTo("");
    table.json("cc").notNullable();
    table.json("bcc").notNullable();
    table.string("from_name", 300).notNullable().defaultTo("");
    table.string("from_email", 320).notNullable().defaultTo("");
    table.string("reply_to", 320).notNullable().defaultTo("");
    table.text("subject_snapshot").notNullable();
    table.text("html_snapshot").notNullable();
    table.text("text_snapshot").notNullable();
    table.json("variables_snapshot").notNullable();
    table.string("delivery_key", 64).nullable();
    table.string("delivery_claim_token", 36).notNullable().defaultTo("");
    table.timestamp("delivery_claim_expires_at", { useTz: false }).nullable();
    table.string("status", 50).notNullable().defaultTo("queued");
    table.string("provider", 100).notNullable().defaultTo("smtp");
    table.string("provider_message_id", 500).notNullable().defaultTo("");
    table.text("error_message").notNullable();
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("sent_at", { useTz: false }).nullable();
    table.string("source_module", 100).notNullable().defaultTo("");
    table.string("source_entity_type", 100).notNullable().defaultTo("");
    table.string("source_entity_id", 36).nullable();
    table.string("created_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["template_key"], "idx_email_logs_template_key");
    table.index(["module"], "idx_email_logs_module");
    table.index(["status", "created_at"], "idx_email_logs_status_created");
    table.index(["to_email", "created_at"], "idx_email_logs_to_email_created");
    table.index(
      ["source_module", "source_entity_type", "source_entity_id"],
      "idx_email_logs_source",
    );
    table.index(
      ["created_by_event_user_id"],
      "idx_email_logs_created_by_event_user_id",
    );
    table.unique(["delivery_key"], "uq_email_logs_delivery_key");
  });

  await knex.schema.createTable("payment_refunds", (table) => {
    table.string("id", 36).primary();

    table.string("source_type", 50).notNullable();
    table.string("source_id", 200).notNullable();

    table.string("order_id", 200).notNullable();
    table.string("ticket_id", 200).nullable();

    table.string("provider", 50).notNullable();
    table.string("provider_payment_id", 300).notNullable();
    table.string("provider_refund_id", 300).nullable();

    table.integer("amount").unsigned().notNullable();
    table.string("currency", 10).notNullable().defaultTo("EUR");

    table.string("idempotency_key", 200).notNullable();

    table.string("status", 50).notNullable().defaultTo("pending");
    table.integer("attempt_count").unsigned().notNullable().defaultTo(0);

    table.string("lease_token", 36).nullable();
    table
      .timestamp("lease_expires_at", { useTz: false, precision: 3 })
      .nullable();
    table.text("last_error").nullable();
    table.timestamp("failed_at", { useTz: false, precision: 3 }).nullable();
    table.timestamp("next_retry_at", { useTz: false, precision: 3 }).nullable();
    table
      .timestamp("provider_succeeded_at", { useTz: false, precision: 3 })
      .nullable();
    table.timestamp("completed_at", { useTz: false, precision: 3 }).nullable();

    table.json("metadata").nullable();
    table.string("triggered_by_event_user_id", 200).nullable();

    table
      .timestamp("created_at", { useTz: false, precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3));
    table
      .timestamp("updated_at", { useTz: false, precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3));

    table.unique(["idempotency_key"], "uq_payment_refunds_idempotency_key");
    table.unique(["source_type", "source_id"], "uq_payment_refunds_source");
    table.index(
      ["status", "next_retry_at", "lease_expires_at", "updated_at"],
      "idx_payment_refunds_retryable",
    );
    table.index(
      ["provider", "provider_payment_id"],
      "idx_payment_refunds_provider_payment",
    );
    table.index(
      ["provider", "provider_refund_id"],
      "idx_payment_refunds_provider_refund",
    );
    table.index(
      ["order_id", "created_at"],
      "idx_payment_refunds_order_created",
    );
    table.index(
      ["ticket_id", "created_at"],
      "idx_payment_refunds_ticket_created",
    );
  });

  await knex.schema.createTable("ticket_templates", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");

    table.integer("schema_version").unsigned().notNullable();
    table.integer("revision").unsigned().notNullable().defaultTo(1);
    table.json("template").notNullable();

    table.string("created_by_event_user_id", 36).nullable();
    table.string("updated_by_event_user_id", 36).nullable();

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["event_id"], "uq_ticket_templates_event_id");
    table.index(
      ["created_by_event_user_id"],
      "idx_ticket_templates_created_by",
    );
    table.index(
      ["updated_by_event_user_id"],
      "idx_ticket_templates_updated_by",
    );
  });

  await knex.schema.createTable("discount_code_groups", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");

    table.string("name", 150).notNullable();
    table.integer("discount_percent").unsigned().notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ["event_id", "created_at"],
      "idx_discount_code_groups_event_created",
    );
  });

  await knex.schema.createTable("discount_codes", (table) => {
    table.string("id", 36).primary();
    table
      .string("event_id", 36)
      .notNullable()
      .references("id")
      .inTable("events")
      .onDelete("CASCADE");
    table
      .string("group_id", 36)
      .notNullable()
      .references("id")
      .inTable("discount_code_groups")
      .onDelete("CASCADE");

    table.string("code", 64).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["event_id", "code"], "uq_discount_codes_event_code");
    table.index(["group_id", "created_at"], "idx_discount_codes_group_created");
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("discount_codes");
  await knex.schema.dropTableIfExists("discount_code_groups");
  await knex.schema.dropTableIfExists("ticket_templates");
  await knex.schema.dropTableIfExists("payment_refunds");
  await knex.schema.dropTableIfExists("email_logs");
  await knex.schema.dropTableIfExists("email_templates");
  await knex.schema.dropTableIfExists("tickets");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("ticket_type_sessions");
  await knex.schema.dropTableIfExists("ticket_types");
  await knex.schema.dropTableIfExists("event_tags");
  await knex.schema.dropTableIfExists("event_faqs");
  await knex.schema.dropTableIfExists("event_sessions");
  await knex.schema.dropTableIfExists("events");
  await knex.schema.dropTableIfExists("media_assets");
  await knex.schema.dropTableIfExists("event_users");
  await knex.schema.dropTableIfExists("event_roles");
}
