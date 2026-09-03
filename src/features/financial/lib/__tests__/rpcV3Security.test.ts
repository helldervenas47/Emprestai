/**
 * ETAPA 4.17 — Testes estáticos de segurança da RPC V3.
 * Impedem regressões de permissão e vazamento de dados financeiros.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..", "..");
const SQL_DIR = join(ROOT, "supabase", "sql");
const SRC_DIR = join(ROOT, "src");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const sqlFiles = walk(SQL_DIR, [".sql"]);
const sqlBodies = sqlFiles.map((f) => ({ file: f, text: readFileSync(f, "utf8").toLowerCase() }));
const migration = readFileSync(join(SQL_DIR, "rpc_v3_final_migration.sql"), "utf8");
const lockdown = readFileSync(join(SQL_DIR, "rpc_v3_lockdown_permissions.sql"), "utf8");

describe("RPC V3 — permissões", () => {
  it("nenhuma migration concede RPC V3 a anon", () => {
    const offenders = sqlBodies.filter(({ text }) =>
      /grant\s+execute\s+on\s+function\s+public\.rpc_v3_[^;]*\bto\b[^;]*\banon\b/s.test(text));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("nenhuma migration concede RPC V3 a PUBLIC", () => {
    const offenders = sqlBodies.filter(({ text }) =>
      /grant\s+execute\s+on\s+function\s+public\.rpc_v3_[^;]*\bto\b[^;]*\bpublic\b/s.test(text));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("backfill e rollback não são concedidos a authenticated", () => {
    const bad = /grant\s+execute\s+on\s+function\s+public\.rpc_v3_(backfill_cache|rollback_batch)[^;]*authenticated/is;
    expect(bad.test(migration)).toBe(false);
  });

  it("a migration revoga explicitamente das três roles", () => {
    for (const fn of ["rpc_v3_backfill_cache", "rpc_v3_validate_backfill_payload", "rpc_v3_rollback_batch"]) {
      const revoked = new RegExp(`revoke all on function public\\.${fn}[^;]*from[^;]*anon`, "is");
      expect(revoked.test(migration), `${fn} sem revoke de anon`).toBe(true);
    }
  });

  it("o lockdown emergencial revoga de public, anon e authenticated", () => {
    expect(/revoke all on function[^;]*from public, anon, authenticated/is.test(lockdown)).toBe(true);
    expect(/to anon/i.test(lockdown.replace(/--[^\n]*/g, ""))).toBe(false);
  });
});

describe("RPC V3 — validador sanitizado", () => {
  const validator = migration.slice(
    migration.indexOf("create or replace function public.rpc_v3_validate_backfill_payload"),
    migration.indexOf("-- 3. ROLLBACK"),
  );

  it("não retorna borrower_name nem dados de cliente", () => {
    expect(/borrower_name|client_name|\bcpf\b|telefone/i.test(validator)).toBe(false);
  });

  it("retorna apenas loan_id, allowed e blocking_reasons", () => {
    expect(validator).toContain("returns table (loan_id uuid, allowed boolean, blocking_reasons text[])");
  });

  it("não expõe valores financeiros nas razões de bloqueio", () => {
    const reasons = validator.match(/'[^']*'/g) ?? [];
    expect(reasons.some((r) => /remaining_amount_atual|paid_installments_atual|\|\|\s*g\./.test(r))).toBe(false);
    expect(/then 'pagamentos legados sem allocation_version' end/.test(validator)).toBe(true);
  });

  it("exige sessão autenticada com mensagem uniforme", () => {
    expect(validator).toContain("if v_user is null then");
    expect(validator).toContain("acesso não autorizado");
  });

  it("é SECURITY INVOKER com search_path fixo", () => {
    expect(validator).toContain("security invoker");
    expect(validator).toContain("set search_path = public");
  });

  it("nunca libera escrita (allowed = false incondicional)", () => {
    expect(validator).toContain("false as allowed");
    expect(/true\s+as\s+allowed/.test(validator)).toBe(false);
  });
});

describe("RPC V3 — modo seguro de escrita", () => {
  it("p_dry_run = false é rejeitado antes de qualquer lock/consulta", () => {
    const fn = migration.slice(
      migration.indexOf("create or replace function public.rpc_v3_backfill_cache"),
      migration.indexOf("-- 2b."),
    );
    const guard = fn.indexOf("if not p_dry_run then");
    const lock = fn.indexOf("for update");
    const update = fn.indexOf("update public.loans");
    const snapshot = fn.indexOf("insert into public.rpc_v3_migration_snapshots");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(lock);
    expect(guard).toBeLessThan(update);
    expect(guard).toBeLessThan(snapshot);
    expect(fn).toContain("escrita bloqueada (modo seguro)");
  });

  it("o rollback exige papel administrativo", () => {
    const fn = migration.slice(migration.indexOf("create or replace function public.rpc_v3_rollback_batch"));
    expect(fn).toContain("public.has_role(v_user, 'admin')");
  });
});

describe("Frontend — nenhuma rota residual de escrita RPC V3", () => {
  const tsFiles = walk(SRC_DIR, [".ts", ".tsx"]).filter((f) => !f.includes("__tests__"));

  it("não invoca supabase.rpc para backfill/rollback/validador", () => {
    const offenders = tsFiles.filter((f) => {
      const t = readFileSync(f, "utf8");
      return /\.rpc\(\s*["'`]rpc_v3_/.test(t);
    });
    expect(offenders).toEqual([]);
  });

  it("nenhum builder do app gera UPDATE public.loans (fora de comentários)", () => {
    const offenders = tsFiles.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        // ignora linhas de comentário SQL/JS que apenas documentam a rota bloqueada
        .some((line) => !/^\s*(\/\/|\*|"?\s*--)/.test(line.trim().replace(/^"/, ""))
          && /update\s+public\.loans/i.test(line)));
    expect(offenders).toEqual([]);
  });
});
