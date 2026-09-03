#!/usr/bin/env node
/**
 * Deploy de TODAS as edge functions via Supabase Management API
 * (sem CLI, sem Docker). Roda só com Node 18+.
 *
 *   node scripts/deploy-edge-functions-api.mjs
 *
 * Inclui também `_shared/` (e qualquer outra pasta auxiliar) como arquivos
 * extras no bundle de cada function que importe `../_shared/...`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF  = process.env.SUPABASE_PROJECT_REF || "syyxnqzxqabeuqbuptkh";

if (!ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN não configurado.");
  process.exit(1);
}

const ROOT = "supabase/functions";
const API  = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function listFunctions() {
  const specific = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (specific.length > 0) return specific;
  return readdirSync(ROOT).filter((n) => {
    if (n.startsWith("_")) return false;
    const p = join(ROOT, n);
    return statSync(p).isDirectory() && existsSync(join(p, "index.ts"));
  });
}

async function deployOne(slug) {
  const fnDir = join(ROOT, slug);
  const files = walk(fnDir);

  const sharedDir = join(ROOT, "_shared");
  if (existsSync(sharedDir)) files.push(...walk(sharedDir));

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({
    name: slug,
    entrypoint_path: `${slug}/index.ts`,
    verify_jwt: false,
  })], { type: "application/json" }));

  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    const buf = readFileSync(abs);
    form.append("file", new Blob([buf], { type: "application/typescript" }), rel);
  }

  const url = `${API}/deploy?slug=${slug}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} — ${text.slice(0,300)}`);
  return "deployed";
}

(async () => {
  const requested = process.argv.slice(2);
  const available = listFunctions();
  const fns = requested.length > 0 ? requested : available;
  const unknown = fns.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Functions inexistentes: ${unknown.join(", ")}`);
  }
  console.log(`Deployando ${fns.length} functions em ${PROJECT_REF}…\n`);
  const failed = [];
  for (const slug of fns) {
    process.stdout.write(`→ ${slug} … `);
    try {
      const action = await deployOne(slug);
      console.log(action);
    } catch (e) {
      console.log("FALHOU:", e.message);
      failed.push(slug);
    }
  }
  console.log(`\nTotal: ${fns.length}  Falhas: ${failed.length}`);
  if (failed.length) {
    console.log("Falharam:");
    for (const s of failed) console.log("  - " + s);
    process.exit(1);
  }
})();
