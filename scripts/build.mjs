import esbuild from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyAssets } from "./copy-assets.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const isWatch = process.argv.includes("--watch");

const targets = [
  {
    entry: path.join(projectRoot, "src/background.ts"),
    outfile: path.join(projectRoot, "dist/background.js"),
    format: "iife",
  },
  {
    entry: path.join(projectRoot, "src/content.ts"),
    outfile: path.join(projectRoot, "dist/content.js"),
    format: "iife",
  },
  {
    entry: path.join(projectRoot, "src/popup/index.ts"),
    outfile: path.join(projectRoot, "dist/popup/index.js"),
    format: "iife",
  },
];

const shared = {
  bundle: true,
  platform: "browser",
  target: "firefox102",
  sourcemap: isWatch ? "inline" : false,
  logLevel: "info",
  legalComments: "none",
};

async function buildOnce() {
  await cleanDist();
  await copyAssets();
  await Promise.all(
    targets.map((target) =>
      esbuild.build({
        ...shared,
        format: target.format,
        entryPoints: [target.entry],
        outfile: target.outfile,
      }),
    ),
  );
}

async function watch() {
  await cleanDist();
  await copyAssets();
  const contexts = await Promise.all(
    targets.map((target) =>
      esbuild.context({
        ...shared,
        format: target.format,
        entryPoints: [target.entry],
        outfile: target.outfile,
      }),
    ),
  );

  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes...");
}

async function cleanDist() {
  await fs.rm(path.join(projectRoot, "dist"), { recursive: true, force: true });
}

if (isWatch) {
  await watch();
} else {
  await buildOnce();
}
