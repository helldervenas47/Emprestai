// STANDALONE — cole INTEIRO no editor da edge function `login-with-username`
// no Supabase Dashboard. NÃO importa nada de ../_shared (que não sobe pelo
// dashboard). Rate-limit e Turnstile siteverify embutidos.
//
// Secrets necessários no projeto Supabase (Edge Functions → Secrets):
//   - EXTERNAL_SUPABASE_URL
//   - EXTERNAL_SUPABASE_ANON_KEY
//   - EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
//   - TURNSTILE_SECRET   (secret real do widget Cloudflare Turnstile)
//
// Verify JWT = OFF ao publicar.

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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ??
      Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!TURNSTILE_SECRET) {
      return new Response(
        JSON.stringify({ error: "Verificação de segurança indisponível. Contate o administrador." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!captchaToken || typeof captchaToken !== "string") {
      return new Response(
        JSON.stringify({ error: "Verificação de segurança obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
    const cfResult = await trySecret(TURNSTILE_SECRET);
    if (!cfResult?.success) {
      console.warn("[turnstile] siteverify failed", {
        codes: cfResult?.["error-codes"],
      });
      return new Response(
        JSON.stringify({ error: "Falha na verificação de segurança. Recarregue a página." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }




    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const input = username.trim();
    const isEmail = input.includes("@");

    const genericError = new Response(
      JSON.stringify({ error: "Email/usuário ou senha incorretos" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        .select("user_id")
        .ilike("username", input)
        .maybeSingle();
      if (!profile) return genericError;
      const { data: userResp } = await adminClient.auth.admin.getUserById(profile.user_id);
      user = userResp?.user;
      if (!user?.email) return genericError;
      email = user.email;
    }

    if (user?.banned_until && new Date(user.banned_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: "Usuário inativo. Contate o administrador." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await verifyClient.auth.signInWithPassword({ email, password });
    if (signInError) return genericError;
    await verifyClient.auth.signOut();

    return new Response(JSON.stringify({ email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[login-with-username] fatal", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
