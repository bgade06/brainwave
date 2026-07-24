import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  }));
  return nested.flat();
}

const files = [
  ...(await javascriptFiles(resolve("src"))),
  ...(await javascriptFiles(resolve("test"))),
];

for (const file of files) {
  await new Promise((fulfill, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) fulfill();
      else reject(new Error(`Syntax check failed: ${file}`));
    });
  });
}
