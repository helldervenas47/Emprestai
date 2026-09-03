import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://api.telegram.org';

// Comandos do bot de DESPESAS (TELEGRAM_API_KEY)
const EXPENSES_COMMANDS = [
  { command: 'saldo', description: 'Gastos do mês por categoria' },
  { command: 'mes', description: 'Resumo completo do mês atual' },
  { command: 'semana', description: 'Resumo dos últimos 7 dias' },
  { command: 'comparar', description: 'Compara este mês com o anterior' },
  { command: 'orcamento', description: 'Status dos orçamentos do mês' },
  { command: 'ultimas', description: 'Últimas 5 despesas' },
  { command: 'apagar', description: 'Apaga a despesa mais recente' },
  { command: 'aporte', description: 'Fazer aporte em uma caixinha (cofrinho)' },
  { command: 'meus_aportes', description: 'Últimos 10 aportes nas caixinhas' },
  { command: 'resgatar', description: 'Resgatar saldo da caixinha para a conta' },
  { command: 'help', description: 'Mostra ajuda' },
  { command: 'start', description: 'Vincular conta com código' },
];

// Comandos do bot de RELATÓRIOS (TELEGRAM_BOT_TOKEN_REPORTS)
const REPORTS_COMMANDS = [
  { command: 'relatorios', description: 'Menu de relatórios disponíveis' },
  { command: 'resumo_operacional', description: 'Resumo operacional do dia' },
  { command: 'dashboard', description: 'Visão executiva consolidada' },
  { command: 'kpi_geral', description: 'KPIs principais da operação' },
  { command: 'carteira_ativa', description: 'Saldo a receber e juros previstos' },
  { command: 'inadimplencia', description: 'Taxa e faixas de inadimplência' },
  { command: 'start', description: 'Vincular bot de relatórios com código' },
  { command: 'help', description: 'Mostra ajuda' },
];

async function publishCommands(
  telegramKey: string,
  commands: { command: string; description: string }[],
) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const setCmdRes = await fetch(`${GATEWAY_URL}/bot${telegramKey}/setMyCommands`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ commands }),
  });
  const setCmdData = await setCmdRes.json();
  if (!setCmdRes.ok) {
    throw new Error(`setMyCommands failed [${setCmdRes.status}]: ${JSON.stringify(setCmdData)}`);
  }

  const setBtnRes = await fetch(`${GATEWAY_URL}/bot${telegramKey}/setChatMenuButton`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  });
  const setBtnData = await setBtnRes.json();
  if (!setBtnRes.ok) {
    throw new Error(`setChatMenuButton failed [${setBtnRes.status}]: ${JSON.stringify(setBtnData)}`);
  }

  return { setMyCommands: setCmdData, setChatMenuButton: setBtnData };
}

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SERVICE_ROLE_KEY") || "";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const EXPENSES_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const REPORTS_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");

  try {
    const result: Record<string, any> = {};

    if (EXPENSES_KEY) {
      try {
        result.expenses = await publishCommands(EXPENSES_KEY, EXPENSES_COMMANDS);
      } catch (err: any) {
        result.expenses = { error: err?.message };
      }
    } else {
      result.expenses = { skipped: 'missing TELEGRAM_BOT_TOKEN' };
    }

    if (REPORTS_KEY) {
      try {
        result.reports = await publishCommands(REPORTS_KEY, REPORTS_COMMANDS);
      } catch (err: any) {
        result.reports = { error: err?.message };
      }
    } else {
      result.reports = { skipped: 'missing TELEGRAM_BOT_TOKEN_REPORTS' };
    }

    // Também sincroniza bots ativos da tabela system_telegram_bots
    try {
      const SUPABASE_URL = getExternalSupabaseUrl();
      const SERVICE_KEY = getExternalServiceRoleKey();
      if (SUPABASE_URL && SERVICE_KEY) {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: dbBots } = await admin
          .from("system_telegram_bots")
          .select("id, purpose, token")
          .eq("active", true)
          .not("token", "is", null);

        for (const bot of dbBots ?? []) {
          const t = String(bot.token || "");
          if (!t) continue;
          const cmds = bot.purpose === "expenses" ? EXPENSES_COMMANDS : REPORTS_COMMANDS;
          try {
            result[`bot_${bot.id}_${bot.purpose || "report"}`] = await publishCommands(t, cmds);
          } catch (err: any) {
            result[`bot_${bot.id}_${bot.purpose || "report"}`] = { error: err?.message };
          }
        }
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ ok: true, expenses_commands: EXPENSES_COMMANDS, reports_commands: REPORTS_COMMANDS, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('telegram-set-commands error:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
