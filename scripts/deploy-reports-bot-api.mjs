#!/usr/bin/env node
// Deploy edge functions to the EXTERNAL Supabase project via the Management API.
// Requires env: EXTERNAL_SUPABASE_ACCESS_TOKEN (Personal Access Token sbp_...)
//               EXTERNAL_PROJECT_REF (defaults to syyxnqzxqabeuqbuptkh)

import { readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");

const TOKEN = process.env.EXTERNAL_SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.EXTERNAL_PROJECT_REF || "syyxnqzxqabeuqbuptkh";

if (!TOKEN) {
  console.error("ERROR: EXTERNAL_SUPABASE_ACCESS_TOKEN is required");
  process.exit(1);
}

const FUNCTIONS = [
  "telegram-reports-poll",
  "telegram-reports-link-code",
  "telegram-vencimentos-semana",
];

// _shared is referenced by ../_shared/... imports
const SHARED_DIR = join(FUNCTIONS_DIR, "_shared");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function deployOne(slug) {
  const fnDir = join(FUNCTIONS_DIR, slug);
  const entrypoint = join(fnDir, "index.ts");
  const files = [entrypoint, ...walk(SHARED_DIR)];

  // Build multipart form. Paths in the bundle must be relative to the function dir,
  // so _shared sits one level up at ../_shared/... — same as in source.
  const form = new FormData();
  const metadata = {
    name: slug,
    verify_jwt: false,
    entrypoint_path: "index.ts",
  };
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));

  for (const filePath of files) {
    const rel = relative(fnDir, filePath); // e.g. "index.ts" or "../_shared/external-supabase.ts"
    const content = readFileSync(filePath);
    form.append("file", new Blob([content], { type: "application/typescript" }), rel);
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`;
  console.log(`▶ Deploying ${slug} (${files.length} files)…`);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ ${slug} failed [${res.status}]:`, text);
    throw new Error(`Deploy failed for ${slug}`);
  }
  console.log(`✅ ${slug} deployed.`);
}

(async () => {
  for (const fn of FUNCTIONS) {
    await deployOne(fn);
  }
  console.log("\n🎉 All done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
