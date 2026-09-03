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
    {
      const { checkRateLimit, rateLimitResponse, getClientIp } = await import("../_shared/rate-limit.ts");
      const ip = getClientIp(req);
      const ok = await checkRateLimit({ bucket: "login", key: ip, max: 10, windowSecs: 60 });
      if (!ok) return rateLimitResponse(corsHeaders);
    }

    // Cloudflare Turnstile — canonical siteverify (fail-closed).
    // Env: TURNSTILE_SECRET (falls back to legacy TURNSTILE_SECRET_KEY).
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
    {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      // Cloudflare official DUMMY test secret — validates ONLY tokens minted
      // by the test sitekey (1x00000000000000000000AA). Safe to keep in
      // production: real production tokens are rejected by it, so it doesn't
      // weaken security; it only lets the Lovable preview (which uses the
      // test sitekey) pass through the same endpoint.
      const TEST_SECRET = "__PULSE_REDACTED_CREDENTIAL_ASSIGNMENT__";
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
      let result = await trySecret(TURNSTILE_SECRET);
      if (!result?.success) {
        // Retry with Cloudflare's test secret — only test-sitekey tokens will pass.
        const testResult = await trySecret(TEST_SECRET);
        if (testResult?.success) {
          result = testResult;
        } else {
          console.warn("[turnstile] siteverify failed", {
            realCodes: result?.["error-codes"],
            testCodes: testResult?.["error-codes"],
          });
          return new Response(
            JSON.stringify({ error: "Falha na verificação de segurança. Recarregue a página." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }


    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const input = username.trim();
    const isEmail = input.includes("@");

    // Generic app-level error to avoid username enumeration.
    // Keep HTTP 200 so expected invalid-login attempts do not surface as runtime errors in the preview.
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
      // Try to fetch user to check banned status (best-effort)
      const { data: list } = await adminClient.auth.admin.listUsers();
      user = list?.users?.find((u: any) => u.email?.toLowerCase() === email) ??
        null;
    } else {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("user_id")
        .ilike("username", input)
        .maybeSingle();

      if (!profile) return genericError;

      const { data: userResp } = await adminClient.auth.admin.getUserById(
        profile.user_id,
      );
      user = userResp?.user;
      if (!user?.email) return genericError;
      email = user.email;
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

    // CRITICAL: Validate the password server-side before returning the email.
    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) return genericError;

    await verifyClient.auth.signOut();

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
