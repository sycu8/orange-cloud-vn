import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = resolve(root, "design/og.html");
const out = resolve(root, "public/og.png");
const profile = resolve("/tmp/og-chrome-profile");

await mkdir(profile, { recursive: true });

const chrome = process.env.CHROME || "google-chrome";
const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--default-background-color=FF100E0C",
  `--user-data-dir=${profile}`,
  `--screenshot=${out}`,
  `file://${html}`,
];

const child = spawn(chrome, args, { stdio: "inherit" });
const code = await new Promise((resolveExit) => {
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    resolveExit(124);
  }, 20000);
  child.on("exit", (status) => {
    clearTimeout(timer);
    resolveExit(status ?? 1);
  });
});

const info = await stat(out);
if (info.size < 1000) {
  console.error(`og.png looks empty (${info.size} bytes)`);
  process.exit(1);
}
if (code !== 0 && code !== 124) {
  console.error(`chrome exited ${code}`);
  process.exit(code);
}
console.log(`wrote ${out} (${info.size} bytes)`);
