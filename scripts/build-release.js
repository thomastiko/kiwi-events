import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, "utf8"),
);

const version = packageJson.version;

if (!version) {
  throw new Error("package.json does not contain a version.");
}

const releaseDir = path.join(projectRoot, "release");

const archiveName = `kiwi-events-v${version}.zip`;
const archivePath = path.join(releaseDir, archiveName);

const archivePrefix = `kiwi-events-v${version}/`;

const releaseFiles = [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "README.md",
  "LICENSE",
];

fs.mkdirSync(releaseDir, {
  recursive: true,
});

if (fs.existsSync(archivePath)) {
  fs.rmSync(archivePath);
}

console.log(`Building ${archiveName}...`);

execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    `--prefix=${archivePrefix}`,
    `--output=${archivePath}`,
    "HEAD",
    ...releaseFiles,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

console.log("");
console.log("Release package created:");
console.log(archivePath);