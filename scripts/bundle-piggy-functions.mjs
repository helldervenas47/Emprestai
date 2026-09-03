// Gera versões "flat" (sem imports relativos) das Edge Functions de cofrinhos
// para colar direto no Supabase Dashboard.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve("supabase/functions");
const OUT = resolve("supabase/functions/_dashboard-bundles");
const FNS = [
  "calcular-rendimento-cofrinhos",
  "processar-deposito-cofrinho",
  "processar-resgate-cofrinho",
  "recalcular-cofrinho",
  "recalcular-historico-cofrinhos",
];

const CLAUSE = String.raw`((?:(?!\bimport\b)[\s\S])*?)`;
const IMPORT_RE = new RegExp(String.raw`^import\s+${CLAUSE}\s+from\s+["'](\.[^"']+)["'];?[ \t]*$`, "gm");
const BARE_IMPORT_RE = new RegExp(String.raw`^import\s+${CLAUSE}\s+from\s+["']([^.][^"']*)["'];?[ \t]*$`, "gm");

function stripExports(src) {
  return src
    .replace(/^export\s+(async\s+function|function|const|let|class|type|interface|enum)/gm, "$1")
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "const __default = ");
}

function aliasLines(clause) {
  // "{ round as roundCore, diffDays, type DailyRateRow }"
  const m = clause.match(/\{([\s\S]*)\}/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const isType = s.startsWith("type ");
      const body = isType ? s.slice(5).trim() : s;
      const parts = body.split(/\s+as\s+/);
      if (parts.length !== 2) return null;
      return isType
        ? `type ${parts[1]} = ${parts[0]};`
        : `const ${parts[1]} = ${parts[0]};`;
    })
    .filter(Boolean);
}

const seen = new Map();
const bareImports = new Map();
const aliases = [];

function collect(file) {
  if (seen.has(file)) return;
  seen.set(file, null);
  let src = readFileSync(file, "utf8");
  const deps = [];
  src = src.replace(IMPORT_RE, (_all, clause, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push(dep);
    aliases.push(...aliasLines(clause));
    return "";
  });
  src = src.replace(BARE_IMPORT_RE, (_all, clause, spec) => {
    const names = bareImports.get(spec) ?? new Set();
    const m = clause.match(/\{([\s\S]*)\}/);
    if (m) {
      m[1].split(",").map((x) => x.trim()).filter(Boolean).forEach((n) => names.add(n));
    } else {
      names.add(clause.trim());
    }
    bareImports.set(spec, names);
    return "";
  });
  for (const d of deps) collect(d);
  seen.set(file, stripExports(src).trim());
}

mkdirSync(OUT, { recursive: true });

for (const fn of FNS) {
  seen.clear();
  bareImports.clear();
  aliases.length = 0;
  const entry = resolve(ROOT, fn, "index.ts");
  collect(entry);

  const ordered = [...seen.entries()];
  let entryCode = ordered.find(([f]) => f === entry)[1];
  let depsCode = ordered.filter(([f]) => f !== entry).reverse();

  // Resolve colisões de nomes entre o index.ts e os módulos inline (_shared).
  const DECL_RE = /^(?:export\s+)?(?:async\s+function|function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm;
  const namesOf = (code) => [...code.matchAll(DECL_RE)].map((m) => m[1]);
  const entryNames = new Set(namesOf(entryCode));
  let renamedAliases = [...aliases];
  for (const name of new Set(depsCode.flatMap(([, c]) => namesOf(c)))) {
    if (!entryNames.has(name)) continue;
    const safe = `${name}$shared`;
    const re = new RegExp(`\\b${name}\\b`, "g");
    depsCode = depsCode.map(([f, c]) => [f, c.replace(re, safe)]);
    renamedAliases = renamedAliases.map((a) => a.replace(re, safe));
    // desfaz renome do lado esquerdo do alias (nome usado pelo index.ts)
    renamedAliases = renamedAliases.map((a) =>
      a.replace(new RegExp(`^(const|type)\\s+${safe.replace("$", "\\$")}\\s*=`), `$1 ${name} =`),
    );
  }

  const header = `// ============================================================\n// ${fn} — VERSÃO FLAT PARA DEPLOY MANUAL NO SUPABASE DASHBOARD\n// Gerado por scripts/bundle-piggy-functions.mjs — NÃO editar à mão.\n// Todos os módulos de _shared/ foram embutidos abaixo.\n// ============================================================\n`;

  const out = [
    header,
    [...bareImports.entries()]
      .map(([spec, names]) => `import { ${[...names].join(", ")} } from "${spec}";`)
      .join("\n"),
    "",
    depsCode
      .map(([f, code]) => `// ---------- inline: ${f.replace(ROOT + "/", "")} ----------\n${code}`)
      .join("\n\n"),
    "",
    renamedAliases.length ? `// ---------- aliases de import ----------\n${[...new Set(renamedAliases)].join("\n")}\n` : "",
    `// ---------- ${fn}/index.ts ----------`,
    entryCode,
    "",
  ].join("\n");

  writeFileSync(resolve(OUT, `${fn}.ts`), out);
  console.log("gerado:", `_dashboard-bundles/${fn}.ts`, `(${out.split("\n").length} linhas)`);
}
