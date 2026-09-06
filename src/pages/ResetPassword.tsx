import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";

type RecoveryStatus = "verifying" | "ready" | "success" | "invalid_or_expired";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<RecoveryStatus>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  const exchangedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // 1. Escuta eventos de autenticação do Supabase em tempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session?.user)) {
        setStatus("ready");
      }
    });

    const verifyRecoveryLink = async () => {
      // Captura código PKCE (?code=...)
      const code = searchParams.get("code");
      const hash = window.location.hash || "";

      // A. Fluxo PKCE moderno (?code=...)
      if (code && !exchangedRef.current) {
        exchangedRef.current = true;
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (isMounted) {
              setStatus("invalid_or_expired");
              setErrorMessage("O link de recuperação é inválido ou já foi utilizado.");
            }
            return;
          }
          // Limpa o código da URL para evitar re-troca em refresh
          if (window.history?.replaceState) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          if (isMounted) {
            setStatus("ready");
          }
          return;
        } catch {
          if (isMounted) {
            setStatus("invalid_or_expired");
            setErrorMessage("Não foi possível validar o link de segurança.");
          }
          return;
        }
      }

      // B. Fluxo legado por Hash (#type=recovery ou #access_token=...)
      if (hash.includes("type=recovery") || hash.includes("access_token")) {
        if (isMounted) {
          setStatus("ready");
        }
        return;
      }

      // C. Verifica se já existe sessão ativa de recovery
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (isMounted) {
          setStatus("ready");
        }
        return;
      }

      // Se nenhum parâmetro de recuperação foi detectado após timeout razoável
      const timer = setTimeout(() => {
        if (isMounted && status === "verifying") {
          setStatus("invalid_or_expired");
          setErrorMessage("Nenhum link de recuperação válido foi encontrado.");
        }
      }, 1500);

      return () => clearTimeout(timer);
    };

    verifyRecoveryLink();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas informadas não coincidem");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("same_password") || msg.includes("different")) {
          toast.error("A nova senha deve ser diferente da senha anterior.");
        } else if (msg.includes("session") || msg.includes("auth")) {
          setStatus("invalid_or_expired");
          toast.error("Sua sessão de recuperação expirou. Solicite um novo link.");
        } else {
          toast.error("Não foi possível atualizar a senha. Tente novamente.");
        }
        return;
      }

      setStatus("success");
      toast.success("Senha alterada com sucesso!");
      // Desconecta a sessão temporária para forçar novo login limpo com as novas credenciais
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    } catch {
      toast.error("Ocorreu um erro ao atualizar a senha. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // ESTADO: CARREGANDO LINK
  if (status === "verifying") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
        <Card no3d className="w-full max-w-md border-border/50 text-center py-10">
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">Validando link de segurança</h3>
              <p className="text-sm text-muted-foreground">Aguarde enquanto confirmamos sua solicitação...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ESTADO: SENHA ALTERADA COM SUCESSO
  if (status === "success") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
        <div className="w-full max-w-md space-y-6">
          <Card no3d className="border-success/30 bg-card/60 shadow-lg text-center">
            <CardHeader className="space-y-3 pb-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-success/10 flex items-center justify-center text-success">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">Senha Atualizada!</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Sua senha foi redefinida com sucesso. Você já pode acessar sua conta utilizando a nova credencial.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                className="w-full h-12 rounded-xl text-base font-semibold gap-2"
                onClick={() => navigate("/auth")}
              >
                Ir para o Login <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ESTADO: LINK EXPIRADO OU INVÁLIDO
  if (status === "invalid_or_expired") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
        <div className="w-full max-w-md space-y-6">
          <Card no3d className="border-destructive/30 bg-card/60 shadow-lg text-center">
            <CardHeader className="space-y-3 pb-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <AlertCircle className="h-8 w-8" />
              </div>
              <CardTitle className="text-xl font-bold text-foreground">Link Inválido ou Expirado</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                {errorMessage || "Este link de recuperação não é mais válido ou já foi utilizado. Por favor, solicite um novo link para redefinir sua senha."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <Button
                className="w-full h-12 rounded-xl text-base font-semibold"
                onClick={() => navigate("/auth")}
              >
                Solicitar novo link
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => navigate("/")}
              >
                Voltar à página inicial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ESTADO: LINK VÁLIDO / FORMULÁRIO DE NOVA SENHA
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          <p className="text-muted-foreground">Defina sua nova senha de acesso</p>
        </div>

        <Card no3d className="border-border/50 bg-card shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Redefinir Senha</CardTitle>
            <CardDescription className="text-sm">
              Crie uma senha forte com no mínimo 6 caracteres para proteger sua conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 h-12 rounded-xl"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9 pr-10 h-12 rounded-xl"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold mt-2"
                disabled={submitting || password.length < 6}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Salvando nova senha...
                  </>
                ) : (
                  "Salvar nova senha"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
