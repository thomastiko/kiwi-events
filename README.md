# Kiwi Events

Kiwi Events is a lightweight, headless event and ticketing backend for building custom event platforms.

It provides the backend infrastructure for events, tickets, registrations, orders, payments, attendees, QR check-in, refunds, mail delivery and file storage while leaving the frontend experience entirely up to you.

## Features

- Event and session management
- Ticket types and ticket inventory
- Free and paid checkout
- Guest checkout
- Discount codes
- Mollie and Stripe payments
- Refunds and cancellations
- QR ticket check-in
- PDF ticket generation
- Mail templates and transactional emails
- SMTP and Resend support
- Local and S3-compatible file storage
- Event users, roles and permissions
- MongoDB, MySQL and MariaDB support
- Built-in administration interface
- REST API for custom frontends and integrations

## Requirements

Before installing Kiwi Events, you need:

- Node.js — a current LTS version is recommended
- npm
- One supported database:
  - MongoDB
  - MySQL
  - MariaDB

Payment providers, external storage and mail providers are optional and can be configured later.

## Installation

Download and extract the latest Kiwi Events release.

Open a terminal inside the extracted directory — the directory containing `package.json` — and install the production dependencies:

```bash
npm ci --omit=dev
```

Start Kiwi Events:

```bash
npm start
```

By default, the administration interface is available at:

```text
http://localhost:5001/admin
```

Kiwi Events does not require a `.env` file for a standard installation.

## First Setup

On the first start, open the Admin UI.

Kiwi Events will guide you through the initial setup.

You will configure:

1. Your database provider
2. Your database connection
3. The initial `admin@admin` account
4. Your admin password
5. The external JWT secret used for host integrations

After setup, sign in through the Admin UI and configure the features you want to use.

## Configuration

Most Kiwi Events configuration is managed directly through the Admin UI.

This includes:

- Application settings
- Ticketing features
- Payment providers
- Mailing
- Storage
- Event users and roles

Local configuration and encrypted secrets are created automatically during setup.

You normally do not need to manually create configuration files.

## Runtime Files

Kiwi Events creates local runtime files during setup and operation, including:

```text
kiwi-events.config.json

data/
├── kiwi-events.master.key
└── kiwi-events.secrets.enc
```

These files are specific to your installation and are intentionally not included in release packages.

### Important

Keep backups of:

- Your database
- `kiwi-events.config.json`
- The `data/` directory

In particular, keep `data/kiwi-events.master.key` secure. It is part of the local secret-storage system and should not be published or shared.

## Optional Integrations

Depending on your configuration, Kiwi Events can integrate with:

### Payments

- Mollie
- Stripe

### Mail

- SMTP
- Resend

### Storage

- Local filesystem
- S3-compatible object storage

This includes providers such as Cloudflare R2 and other S3-compatible services.

## Running Kiwi Events

Production:

```bash
npm start
```

The installed version is read directly from `package.json` and is displayed when the server starts.

## Maintenance

Kiwi Events includes maintenance commands for database migrations and system administration.

Run database migrations:

```bash
npm run db:migrate
```

Rollback the latest database migration:

```bash
npm run db:rollback
```

Reset Kiwi Events:

```bash
npm run reset
```

Resetting Kiwi Events is destructive. Back up your data before using reset commands.

## License

Kiwi Events is source-available and free to self-host and use, including for commercial events and business operations.

You may modify Kiwi Events for your own needs and integrate it into your own systems.

You may not use Kiwi Events to provide or market a product or service that competes with Kiwi Events.

Kiwi Events is licensed under the PolyForm Perimeter License 1.0.1.

See `LICENSE` for the complete license terms.

## Development

For development, install all dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

Run Prettier:

```bash
npx prettier --write .
```

## Project Structure

```text
public/     Admin interface and public assets
src/        Kiwi Events backend
```

Development-only files such as tests and tooling are intentionally excluded from downloadable release packages.

## API

Kiwi Events is designed as a headless backend.

Custom applications can integrate with the REST API for events, ticketing, orders, payments, attendees, check-in and administrative workflows.

API documentation is available through the Kiwi Events documentation website and the administration tooling.
