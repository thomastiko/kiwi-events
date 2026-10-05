import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { getConfiguredDatabase } from "../modules/database/database.service.js";

import { resetKiwiEventsService } from "../modules/system/system.reset.service.js";

const args = process.argv.slice(2);

const forceYes = args.includes("--yes") || args.includes("-y");

const skipDatabase = args.includes("--skip-db");

const skipUploads = args.includes("--skip-uploads");

const skipConfig = args.includes("--skip-config");

function log(message) {
  console.log(`[reset-kiwi-events] ${message}`);
}

function warn(message) {
  console.warn(`[reset-kiwi-events] ${message}`);
}

function error(message) {
  console.error(`[reset-kiwi-events] ${message}`);
}

async function askForConfirmation(database) {
  if (forceYes) {
    return true;
  }

  console.log("");
  console.log("This will reset kiwi-events to first-start state.");
  console.log("");
  console.log("It will delete:");
  console.log("- the configured kiwi-events database content");
  console.log("- kiwi-events.config.json");
  console.log("- local uploads");
  console.log("");
  console.log("Current database:");
  console.log(`- provider: ${database.provider || "not configured"}`);
  console.log(`- source: ${database.source || "none"}`);
  console.log("");

  const rl = readline.createInterface({
    input,
    output,
  });

  try {
    const answer = await rl.question('Type "reset kiwi-events" to continue: ');

    return answer.trim() === "reset kiwi-events";
  } finally {
    rl.close();
  }
}

async function main() {
  const database = getConfiguredDatabase();

  const confirmed = await askForConfirmation(database);

  if (!confirmed) {
    warn("Reset cancelled.");
    process.exit(1);
  }

  console.log("");

  const result = await resetKiwiEventsService({
    skipDatabase,
    skipUploads,
    skipConfig,
  });

  log("Reset completed.");

  console.log(JSON.stringify(result, null, 2));

  console.log("");

  log("Next start will open kiwi-events in setup mode again.");
}

main().catch((err) => {
  error(err?.message || "Reset failed.");

  console.error(err);

  process.exit(1);
});
