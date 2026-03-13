#!/usr/bin/env bun
/**
 * Build script: install deps → vite build → bun compile backend
 */
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const FRONTEND_DIR = join(ROOT, "packages/frontend");
const BACKEND_DIR = join(ROOT, "packages/backend");

async function step(label: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${label}... `);
  await fn();
  console.log("done");
}

console.log("\n🔨 Building monitor\n");

// Step 1: Install deps
await step("Installing dependencies", async () => {
  const r = Bun.spawn(["bun", "install"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  await r.exited;
  if (r.exitCode !== 0) throw new Error("bun install failed");
});

// Step 2: Build frontend
await step("Building frontend (vite)", async () => {
  const r = Bun.spawn(["bun", "run", "build"], { cwd: FRONTEND_DIR, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(r.stdout).text(),
    new Response(r.stderr).text(),
  ]);
  await r.exited;
  if (r.exitCode !== 0) {
    console.error(out, err);
    throw new Error("vite build failed");
  }
});

// Step 3: Compile backend to single executable
await step("Compiling backend executable", async () => {
  const outFile = join(ROOT, "monitor");
  const r = Bun.spawn(
    [
      "bun", "build",
      join(BACKEND_DIR, "src/index.ts"),
      "--compile",
      "--minify",
      "--sourcemap",
      `--outfile=${outFile}`,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
  );
  const [, err] = await Promise.all([
    new Response(r.stdout).text(),
    new Response(r.stderr).text(),
  ]);
  await r.exited;
  if (r.exitCode !== 0) {
    console.error(err);
    throw new Error("bun build --compile failed");
  }
});

console.log("\n✅ Done! Backend executable: ./monitor, frontend assets: ./packages/frontend/dist\n");
