#!/usr/bin/env -S deno run -A
// Compara funções deployadas no Supabase externo com as do repositório.
//
// Uso:
//   export SUPABASE_ACCESS_TOKEN=sbp_xxx        # https://supabase.com/dashboard/account/tokens
//   export EXTERNAL_PROJECT_REF=xxxxxxxx        # ref do projeto externo
//   deno run -A scripts/compare-edge-functions.ts
//
// (ou rode com bun: `bun scripts/compare-edge-functions.ts` após `bun add -d tsx` — Deno é mais simples)

const TOKEN = Deno.env.get("SUPABASE_ACCESS_TOKEN");
const REF = Deno.env.get("EXTERNAL_PROJECT_REF");

if (!TOKEN || !REF) {
  console.error("❌ Defina SUPABASE_ACCESS_TOKEN e EXTERNAL_PROJECT_REF");
  Deno.exit(1);
}

// 1. Funções deployadas (Management API)
const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/functions`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
if (!res.ok) {
  console.error(`❌ API erro ${res.status}: ${await res.text()}`);
  Deno.exit(1);
}
const deployed: { slug: string; status: string; version: number }[] = await res
  .json();
const deployedSet = new Set(deployed.map((f) => f.slug));

// 2. Funções no repositório
const repo: string[] = [];
for await (const entry of Deno.readDir("supabase/functions")) {
  if (entry.isDirectory && !entry.name.startsWith("_")) repo.push(entry.name);
}
const repoSet = new Set(repo);

// 3. Diff
const onlyRepo = repo.filter((f) => !deployedSet.has(f)).sort();
const onlyDeployed = [...deployedSet].filter((f) => !repoSet.has(f)).sort();
const both = repo.filter((f) => deployedSet.has(f)).sort();

console.log(`\n📦 Repositório: ${repo.length} funções`);
console.log(`☁️  Deployadas:  ${deployed.length} funções\n`);

console.log(`✅ Em ambos (${both.length}):`);
both.forEach((f) => console.log(`   - ${f}`));

console.log(`\n⚠️  Só no repo, NÃO deployadas (${onlyRepo.length}):`);
onlyRepo.forEach((f) => console.log(`   - ${f}`));

console.log(`\n🗑️  Só deployadas, sem código no repo (${onlyDeployed.length}):`);
onlyDeployed.forEach((f) => console.log(`   - ${f}`));
