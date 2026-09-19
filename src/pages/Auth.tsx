import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  ArrowLeft,
  TrendingUp,
  Zap,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { toast } from "sonner";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const Auth = () => {
  const [isForgot, setIsForgot] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const { branding } = useAppBranding();
  const brandName = branding.brand_name || "EmprestAI";

  const authInputClass =
    "h-12 rounded-xl border border-border/70 bg-background/80 hover:bg-background/95 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all text-sm placeholder:text-muted-foreground/60";

  // Check if a Google OAuth user was just auto-created (no prior account)
  useEffect(() => {
    const checkNewOAuthUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const user = session.user;
      const isOAuth = user.app_metadata?.provider === "google";
      if (!isOAuth) return;

      // If created_at is within the last 60 seconds, this is a new account
      const createdAt = new Date(user.created_at).getTime();
      const now = Date.now();
      if (now - createdAt < 60_000) {
        // New user via Google on login page — block and sign out
        await supabase.auth.signOut();
        toast.error("Você ainda não tem uma conta. Crie uma conta primeiro escolhendo um plano.");
        window.location.assign("/planos");
      }
    };

    // Listen for OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        checkNewOAuthUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error("Erro ao conectar com Google");
        setGoogleLoading(false);
      }
    } catch {
      toast.error("Erro ao conectar com Google");
      setGoogleLoading(false);
    }
  };

  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLoginId = loginId.trim();
    if (!cleanLoginId || !password) {
      toast.error("Informe seu usuário/email e senha");
      return;
    }

    if (!captchaToken) {
      toast.error("Complete a verificação de segurança");
      return;
    }
    setLoading(true);

    try {
      let emailToUse = cleanLoginId;

      if (!isEmail(cleanLoginId)) {
        // 1. Tenta resolver o username via RPC direto no banco de dados (rápido e direto)
        let resolvedEmail: string | null = null;
        try {
          const { data: rpcEmail, error: rpcError } = await supabase.rpc("get_email_by_username", {
            p_username: cleanLoginId,
          });
          if (!rpcError && rpcEmail && typeof rpcEmail === "string") {
            resolvedEmail = rpcEmail;
          }
        } catch {
          // segue para a edge function
        }

        // 2. Se a RPC não resolveu, consulta a Edge Function login-with-username
        if (!resolvedEmail) {
          const { data, error: fnError } = await supabase.functions.invoke("login-with-username", {
            body: { username: cleanLoginId, password, captchaToken },
          });

          let serverError: string | undefined = data?.error;
          if (fnError && (fnError as any).context instanceof Response) {
            try {
              const body = await (fnError as any).context.clone().json();
              serverError = body?.error ?? serverError;
            } catch { /* noop */ }
          }

          if (data?.email) {
            resolvedEmail = data.email;
          } else if (fnError || data?.error) {
            setLoading(false);
            resetCaptcha();
            toast.error(serverError || "Email/usuário ou senha incorretos");
            return;
          }
        }

        if (!resolvedEmail) {
          setLoading(false);
          resetCaptcha();
          toast.error("Email/usuário ou senha incorretos");
          return;
        }

        emailToUse = resolvedEmail;
      }

      // Autentica via Supabase Auth
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse.toLowerCase(),
        password,
      });

      setLoading(false);
      if (error) {
        resetCaptcha();
        if (error.message === "Invalid login credentials") {
          toast.error("Email/usuário ou senha incorretos");
        } else if (error.message.toLowerCase().includes("banned") || error.message.toLowerCase().includes("ban")) {
          toast.error("Usuário inativo. Contate o administrador.");
        } else {
          toast.error(error.message);
        }
      }
    } catch {
      setLoading(false);
      resetCaptcha();
      toast.error("Erro ao realizar login. Verifique seus dados e tente novamente.");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Digite seu email");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
      setIsForgot(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col lg:grid lg:grid-cols-12 overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          COLUNA ESQUERDA: Showcase SaaS / Vitrine Visual (Desktop)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative flex-col justify-between p-8 xl:p-14 bg-gradient-to-br from-card/80 via-card/40 to-background border-r border-border/60 overflow-hidden">
        {/* Glow Effects e Grid de Fundo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-[480px] h-[480px] bg-primary/20 blur-[120px] rounded-full" />
          <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[420px] h-[420px] bg-sky-500/15 blur-[140px] rounded-full" />
          <div className="absolute -bottom-24 left-1/4 w-[380px] h-[380px] bg-primary/10 blur-[100px] rounded-full" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        {/* Topo: Logo & Nome (Apenas o ícone limpo, sem bordas/container) */}
        <div className="relative z-10 flex items-center gap-3.5">
          <AppLogo area="auth" alt={brandName} />
          <div>
            <span className="text-xl font-bold tracking-tight text-foreground">{brandName}</span>
            <span className="block text-xs font-medium text-primary uppercase tracking-wider">
              Gestão Financeira & Empréstimos
            </span>
          </div>
        </div>

        {/* Centro: Título de Impacto + Cards Flutuantes de Destaque */}
        <div className="relative z-10 my-auto py-10 max-w-xl space-y-8 animate-fade-in">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Controle financeiro inteligente de ponta a ponta</span>
            </div>
            <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-foreground leading-[1.2]">
              Tudo o que você precisa para gerenciar contratos com <span className="text-primary">precisão</span>.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Monitore recebimentos, cobranças automatizadas, fluxo de caixa e simulações tributárias em uma única
              plataforma moderna e segura.
            </p>
          </div>

          {/* Cards Demonstrativos de Funcionalidades (Mini-Dashboard Preview) */}
          <div className="grid sm:grid-cols-2 gap-3.5 pt-2">
            {/* Card 1: Automação Inteligente (Sem menção a WhatsApp) */}
            <div className="p-4 rounded-2xl bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/80 shadow-lg shadow-black/5 hover:border-primary/40 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Automação Inteligente</h4>
                  <p className="text-xs text-muted-foreground">Alertas & Cobrança</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/90">
                Disparos automáticos de avisos de vencimento e relatórios em tempo real sem esforço manual.
              </p>
            </div>

            {/* Card 2: DRE & Rentabilidade */}
            <div className="p-4 rounded-2xl bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/80 shadow-lg shadow-black/5 hover:border-primary/40 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">DRE & Lucro</h4>
                  <p className="text-xs text-emerald-500 font-medium">+100% Auditado</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/90">
                Separação exata de rendimento de juros, amortização do principal e livro caixa.
              </p>
            </div>
          </div>

          {/* Lista de Recursos Rápidos */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Contratos e Parcelas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Controle de Clientes & Vendas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Simulador de Tributos</span>
            </div>
          </div>
        </div>

        {/* Rodapé da Coluna Esquerda: Credibilidade */}
        <div className="relative z-10 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Criptografia de nível bancário e alta disponibilidade</span>
          </div>
          <span className="opacity-70">© {new Date().getFullYear()} {brandName}</span>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          COLUNA DIREITA: Formulário de Login / Recuperação (Desktop & Mobile)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="lg:col-span-6 xl:col-span-5 relative flex flex-col justify-center items-center min-h-screen px-4 sm:px-8 py-10 sm:py-14">
        {/* Glow de Fundo para Mobile / Tablet */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[300px] bg-primary/20 blur-3xl rounded-full" />
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[480px] h-[260px] bg-primary/10 blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 w-full max-w-[400px] space-y-6">
          {/* Logo no topo (Apenas o ícone limpo no Mobile/Tablet) */}
          <div className="lg:hidden text-center space-y-2">
            <div className="relative inline-flex items-center justify-center">
              <AppLogo area="auth" alt={brandName} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{brandName}</h1>
          </div>

          {/* -------------------- MODO RECUPERAÇÃO DE SENHA -------------------- */}
          {isForgot ? (
            <div className="rounded-2xl sm:rounded-3xl border border-border/80 bg-card/75 dark:bg-card/45 backdrop-blur-xl shadow-2xl shadow-primary/5 p-6 sm:p-8 space-y-5 animate-fade-in">
              <div className="space-y-1 text-center">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Recuperar Acesso</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Digite seu email cadastrado para receber o link seguro de redefinição de senha.
                </p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-foreground">
                    Email cadastrado
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`pl-10 ${authInputClass}`}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.99] transition-all duration-200 bg-primary hover:bg-primary/95 text-primary-foreground"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando link...
                    </span>
                  ) : (
                    "Enviar link de recuperação"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setIsForgot(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Button>
              </form>
            </div>
          ) : (
            /* -------------------- MODO LOGIN PADRÃO -------------------- */
            <div className="rounded-2xl sm:rounded-3xl border border-border/80 bg-card/75 dark:bg-card/45 backdrop-blur-xl shadow-2xl shadow-primary/5 p-6 sm:p-8 space-y-5 animate-fade-in">
              <div className="space-y-1 text-center">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Entre com suas credenciais para acessar o painel.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Campo Usuário/Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="loginId" className="text-xs font-medium text-foreground">
                    Email ou Usuário
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                    <Input
                      id="loginId"
                      type="text"
                      placeholder="seu email ou nome de usuário"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      className={`pl-10 ${authInputClass}`}
                      required
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-foreground">
                      Senha
                    </Label>
                    <button
                      type="button"
                      onClick={() => setIsForgot(true)}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-10 pr-10 ${authInputClass}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                      className="absolute right-3.5 top-3.5 text-muted-foreground/70 hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Turnstile Captcha Widget */}
                <div className="flex justify-center pt-1">
                  <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
                </div>

                {/* Botão de Entrar */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.99] transition-all duration-200 bg-primary hover:bg-primary/95 text-primary-foreground"
                  disabled={loading || !captchaToken}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Entrando...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Entrar no sistema
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>

              {/* Divisor */}
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2.5 text-muted-foreground/80 font-medium">ou</span>
                </div>
              </div>

              {/* Ações Secundárias */}
              <div className="space-y-3">
                <div className="text-center text-sm text-muted-foreground">
                  Ainda não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => window.location.assign("/cadastro")}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors hover:underline"
                  >
                    Criar conta
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl text-sm font-semibold border-primary/40 text-primary hover:bg-primary/10 hover:border-primary transition-all duration-200"
                  onClick={() => window.location.assign("/planos")}
                >
                  Ver planos e preços
                </Button>
              </div>
            </div>
          )}

          {/* Rodapé de Segurança Mobile */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 lg:hidden">
            <ShieldCheck className="h-4 w-4 text-primary/70" />
            <span>Ambiente seguro com criptografia de ponta a ponta</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
