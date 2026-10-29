
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const releaseFiles = [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "README.md",
  "LICENSE",
  "Dockerfile",
  ".dockerignore",
  "compose.yaml",
];

const releaseScripts = [
  "start",
  "db:migrate",
  "db:rollback",
  "reset",
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    ...options,
  });
}

function readCommittedFile(file) {
  return git(["show", `HEAD:${file}`]);
}

// Build only from committed source files.
const uncommitted = git([
  "status",
  "--porcelain",
  "--",
  ...releaseFiles,
]).trim();

if (uncommitted) {
  throw new Error(
    "Commit all release changes first:\n" + uncommitted,
  );
}

// Read the original project package.
const projectPackage = JSON.parse(
  readCommittedFile("package.json"),
);

const version = projectPackage.version;

if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version || "")) {
  throw new Error("Invalid or missing package version.");
}

// Keep only scripts useful to release users.
const scripts = {};

for (const script of releaseScripts) {
  if (!projectPackage.scripts?.[script]) {
    throw new Error(`Missing npm script: ${script}`);
  }

  scripts[script] = projectPackage.scripts[script];
}

const releasePackage = {
  ...projectPackage,
  scripts,
};

delete releasePackage.devDependencies;

// Adjust lockfile root metadata to the release manifest.
const releaseLock = JSON.parse(
  readCommittedFile("package-lock.json"),
);

if (!releaseLock.packages?.[""]) {
  throw new Error("Unsupported package-lock.json format.");
}

releaseLock.version = version;
releaseLock.packages[""].version = version;
delete releaseLock.packages[""].devDependencies;

// Ensure Docker Compose uses the release version.
const composeSource = readCommittedFile("compose.yaml");

let composeUpdated = false;

const releaseCompose = composeSource.replace(
  /^(\s*image:\s*["']?tikowiz\/kiwi-events:)[^\s"']+/m,
  (_match, prefix) => {
    composeUpdated = true;
    return `${prefix}${version}`;
  },
);

if (!composeUpdated) {
  throw new Error(
    "Could not find the Docker image tag in compose.yaml.",
  );
}

// Prepare output.
const releaseDir = path.join(projectRoot, "release");

fs.mkdirSync(releaseDir, { recursive: true });

const archiveName = `kiwi-events-v${version}.zip`;
const archivePath = path.join(releaseDir, archiveName);
const archivePrefix = `kiwi-events-v${version}/`;

// Use a temporary Git index.
// The real repository and its package.json stay unchanged.
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "kiwi-release-"),
);

const tempIndexEnv = {
  ...process.env,
  GIT_INDEX_FILE: path.join(tempDir, "index"),
};

function stageReleaseFile(file, content) {
  const hash = git(
    ["hash-object", "-w", "--stdin"],
    { input: content },
  ).trim();

  git(
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${hash},${file}`,
    ],
    { env: tempIndexEnv },
  );
}

try {
  git(["read-tree", "HEAD"], {
    env: tempIndexEnv,
  });

  stageReleaseFile(
    "package.json",
    JSON.stringify(releasePackage, null, 2) + "\n",
  );

  stageReleaseFile(
    "package-lock.json",
    JSON.stringify(releaseLock, null, 2) + "\n",
  );

  stageReleaseFile("compose.yaml", releaseCompose);

  const releaseTree = git(
    ["write-tree"],
    { env: tempIndexEnv },
  ).trim();

  if (fs.existsSync(archivePath)) {
    fs.rmSync(archivePath);
  }

  console.log(`Building ${archiveName}...`);

  git(
    [
      "archive",
      "--format=zip",
      `--prefix=${archivePrefix}`,
      `--output=${archivePath}`,
      releaseTree,
      "--",
      ...releaseFiles,
    ],
    { stdio: "inherit" },
  );

  console.log("");
  console.log("Release package created:");
  console.log(archivePath);
} finally {
  fs.rmSync(tempDir, {
    recursive: true,
    force: true,
  });
}
