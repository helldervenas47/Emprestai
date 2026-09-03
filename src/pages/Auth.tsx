import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
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
  const brandName = branding.brand_name;
  const authInputClass = "h-12 rounded-xl border-input bg-background/60 focus-visible:ring-inset focus-visible:ring-offset-0 focus-visible:shadow-none";

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
      // Retorna para a MESMA URL atual (mantém o PWA dentro do escopo
      // `/` do manifest e evita reload completo para `/`). Importante
      // para iOS/Android instalado preservar o modo standalone.
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
      // Em sucesso, o browser redireciona para o Google e retorna para /auth,
      // onde o detectSessionInUrl+PKCE faz a troca sem perder a sessão.
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
    if (!captchaToken) {
      toast.error("Complete a verificação de segurança");
      return;
    }
    setLoading(true);
    // Sempre passa pela edge function (valida captcha + senha + rate limit)
    const { data, error: fnError } = await supabase.functions.invoke("login-with-username", {
      body: { username: loginId, password, captchaToken },
    });
    let serverError: string | undefined = data?.error;
    if (fnError && (fnError as any).context instanceof Response) {
      try {
        const body = await (fnError as any).context.clone().json();
        serverError = body?.error ?? serverError;
      } catch { /* noop */ }
    }
    if (fnError || data?.error || !data?.email) {
      setLoading(false);
      resetCaptcha();
      toast.error(serverError || "Email/usuário ou senha incorretos");
      return;
    }
    const emailToUse = data.email;
    const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
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

  if (isForgot) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
              <AppLogo area="auth" alt={brandName} rounded />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
            <p className="text-muted-foreground">Digite seu email para receber o link de recuperação</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`pl-9 ${authInputClass}`} required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setIsForgot(false)}>
              Voltar ao login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          <p className="text-muted-foreground">Entre na sua conta</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="loginId">Email ou Usuário</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
              <Input id="loginId" type="text" placeholder="email ou nome de usuário" value={loginId} onChange={(e) => setLoginId(e.target.value)} className={`pl-9 ${authInputClass}`} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`pl-9 pr-9 ${authInputClass}`}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setIsForgot(true)} className="text-sm text-primary hover:underline">
            Esqueceu a senha?
          </button>
          <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading || !captchaToken}>
            {loading ? "Aguarde..." : "Entrar"}
          </Button>
        </form>

        {/* Google login temporariamente desativado */}

        <div className="text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <button onClick={() => window.location.assign("/cadastro")} className="text-primary hover:underline font-medium">
            Criar conta
          </button>
        </div>
        <div className="text-center">
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl text-sm font-semibold border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => window.location.assign("/planos")}
          >
            Ver planos e preços
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
