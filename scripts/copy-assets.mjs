import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "static");
const targetDir = path.join(projectRoot, "dist");

async function copyDirectory(src, dest) {
  const stats = await fs.stat(src).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    return;
  }

  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(srcPath, destPath);
      }
    }),
  );
}

export async function copyAssets() {
  await copyDirectory(sourceDir, targetDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyAssets().catch((error) => {
    console.error("Failed to copy static assets:", error);
    process.exitCode = 1;
  });
}
