import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password, captchaToken } = await req.json();

    if (
      !username || !password || typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Usuário e senha são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Rate limit: 10 tentativas/min por IP
    try {
      const { checkRateLimit, rateLimitResponse, getClientIp } = await import("../_shared/rate-limit.ts");
      const ip = getClientIp(req);
      const ok = await checkRateLimit({ bucket: "login", key: ip, max: 10, windowSecs: 60 });
      if (!ok) return rateLimitResponse(corsHeaders);
    } catch {
      // Best-effort rate limiting
    }

    // Cloudflare Turnstile — validação com fallback para chave de teste
    const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ??
      Deno.env.get("TURNSTILE_SECRET_KEY");

    if (captchaToken && typeof captchaToken === "string") {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const trySecret = async (secret: string) => {
        const verify = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret,
              response: captchaToken,
              ...(clientIp ? { remoteip: clientIp } : {}),
            }),
          },
        );
        return await verify.json().catch(() => ({ success: false }));
      };

      let turnstileValid = false;
      if (TURNSTILE_SECRET) {
        const res = await trySecret(TURNSTILE_SECRET);
        if (res?.success) turnstileValid = true;
      }
      if (!turnstileValid) {
        // Fallback para test secret (localhost / preview / dummy token)
        const testRes = await trySecret("1x0000000000000000000000000000000AA");
        if (testRes?.success) turnstileValid = true;
      }

      if (!turnstileValid && TURNSTILE_SECRET) {
        return new Response(
          JSON.stringify({ error: "Falha na verificação de segurança. Recarregue a página." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const input = username.trim();
    const isEmail = input.includes("@");

    const genericError = new Response(
      JSON.stringify({ error: "Email/usuário ou senha incorretos" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );

    let email: string;
    let user: any = null;

    if (isEmail) {
      email = input.toLowerCase();
      const { data: list } = await adminClient.auth.admin.listUsers();
      user = list?.users?.find((u: any) => u.email?.toLowerCase() === email) ?? null;
    } else {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("user_id, email")
        .ilike("username", input)
        .maybeSingle();

      if (!profile) return genericError;

      if (profile.email) {
        email = profile.email;
      } else {
        const { data: userResp } = await adminClient.auth.admin.getUserById(profile.user_id);
        user = userResp?.user;
        if (!user?.email) return genericError;
        email = user.email;
      }
    }

    // Check if user is banned/inactive
    if (user?.banned_until && new Date(user.banned_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: "Usuário inativo. Contate o administrador." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (anonKey) {
      const verifyClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await verifyClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) return genericError;

      await verifyClient.auth.signOut().catch(() => {});
    }

    return new Response(JSON.stringify({ email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
