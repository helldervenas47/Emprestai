import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, USER_SUPABASE_PUBLISHABLE_KEY, USER_SUPABASE_URL } from "@/integrations/supabase/userClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  IdCard,
  Phone,
  Gift,
  CreditCard,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Zap,
  MailCheck,
  RefreshCw,
  Wallet,
  Check,
  Star,
  Bell,
  ArrowUpRight,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { validateInviteCode } from "@/features/admin/hooks/useInviteCodes";
import { toast } from "sonner";
import { formatCpfOrCnpj, formatPhone, isValidCpfOrCnpj } from "@/lib/brDocuments";
import { validateUsernameFormat, isUsernameAvailable, normalizeUsername } from "@/lib/username";

const Cadastro = () => {
  const [searchParams] = useSearchParams();
  const planName = searchParams.get("plan") || "";
  const inviteCode = searchParams.get("invite") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [inviteState, setInviteState] = useState<{
    checking: boolean;
    valid: boolean;
    owner_id?: string;
    require_approval?: boolean;
    reason?: string;
  }>({ checking: !!inviteCode, valid: false });
  const navigate = useNavigate();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name || "EmprestAI";

  const authInputClass =
    "h-12 rounded-xl border border-border/70 bg-background/80 hover:bg-background/95 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all text-sm placeholder:text-muted-foreground/60";

  const ensureDefaultClienteRole = async (
    userId: string,
    userEmail?: string | null,
    accessToken?: string | null,
    extra?: Record<string, unknown>
  ) => {
    try {
      const response = await fetch(`${USER_SUPABASE_URL}/functions/v1/ensure-user-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: USER_SUPABASE_PUBLISHABLE_KEY,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ userId, email: userEmail, role: "cliente", ...(extra ?? {}) }),
      });
      const ensuredRole = await response.json().catch(() => null);

      if (!response.ok || ensuredRole?.error) {
        const errStr = ensuredRole ? JSON.stringify(ensuredRole).toLowerCase() : "";
        if (response.status === 401 || errStr.includes("invalid_token") || errStr.includes("session_not_found")) {
          try {
            await supabase.auth.signOut({ scope: "local" });
            Object.keys(localStorage).forEach((k) => {
              if (k.startsWith("sb-")) localStorage.removeItem(k);
            });
          } catch {}
          return false;
        }
        console.error("[cadastro] ensure-user-role failed", ensuredRole?.error ?? response.statusText);
        toast.error("Cadastro criado, mas a função padrão não foi atribuída. Faça login novamente para reaplicar.");
        return false;
      }

      return ensuredRole?.role === "cliente";
    } catch (error) {
      console.error("[cadastro] ensure-user-role error:", error);
      return false;
    }
  };

  // Validate invite code on mount
  useEffect(() => {
    if (!inviteCode) {
      setInviteState({ checking: false, valid: false });
      return;
    }
    (async () => {
      const result = await validateInviteCode(inviteCode);
      setInviteState({ checking: false, ...result });
    })();
  }, [inviteCode]);

  // Debounced availability check para username
  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) {
      setUsernameStatus("idle");
      setUsernameError(null);
      return;
    }
    const fmt = validateUsernameFormat(u);
    if (fmt) {
      setUsernameStatus("invalid");
      setUsernameError(fmt);
      return;
    }
    setUsernameStatus("checking");
    setUsernameError(null);
    const t = setTimeout(async () => {
      const ok = await isUsernameAvailable(u);
      if (ok) {
        setUsernameStatus("available");
        setUsernameError(null);
      } else {
        setUsernameStatus("taken");
        setUsernameError("Esse usuário já está em uso");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  useEffect(() => {
    const ensureOAuthSignupRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      await ensureDefaultClienteRole(session.user.id, session.user.email, session.access_token);
    };

    ensureOAuthSignupRole();
  }, []);

  const handleGoogleSignup = async () => {
    if (inviteCode && !inviteState.valid) {
      toast.error("Código de convite inválido");
      return;
    }
    setGoogleLoading(true);
    try {
      if (inviteCode && inviteState.valid) {
        sessionStorage.setItem("pending_invite_code", inviteCode);
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/cadastro`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error("Erro ao conectar com Google");
        setGoogleLoading(false);
        return;
      }
    } catch {
      toast.error("Erro ao conectar com Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const applyInviteAfterSignup = async (userId: string) => {
    if (!inviteCode || !inviteState.valid || !inviteState.owner_id) return;

    if (inviteState.require_approval) {
      await (supabase as any).from("user_approvals").insert({
        user_id: userId,
        owner_id: inviteState.owner_id,
        status: "pending",
        email,
        display_name: displayName,
        invite_code: inviteCode,
      });

      supabase.functions
        .invoke("notify-approval-request", {
          body: { owner_id: inviteState.owner_id, display_name: displayName, email },
        })
        .catch(() => {});

      await ensureDefaultClienteRole(userId, email);
    } else {
      await (supabase as any).from("user_owner").upsert(
        { user_id: userId, owner_id: inviteState.owner_id },
        { onConflict: "user_id" }
      );
      await ensureDefaultClienteRole(userId, email);
    }

    await (supabase as any).rpc("noop").catch(() => {});
    const { data: current } = await (supabase as any)
      .from("invite_codes")
      .select("uses_count")
      .eq("code", inviteCode)
      .maybeSingle();
    if (current) {
      await (supabase as any)
        .from("invite_codes")
        .update({ uses_count: (current.uses_count || 0) + 1 })
        .eq("code", inviteCode);
    }
  };

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    const normalizedUsername = normalizeUsername(username);
    const fmtErr = validateUsernameFormat(normalizedUsername);
    if (fmtErr) {
      setUsernameError(fmtErr);
      toast.error(fmtErr);
      return;
    }
    const available = await isUsernameAvailable(normalizedUsername);
    if (!available) {
      setUsernameStatus("taken");
      setUsernameError("Esse usuário já está em uso");
      toast.error("Esse usuário já está em uso");
      return;
    }
    const cpfDigits = cpfCnpj.replace(/\D/g, "");
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      return;
    }
    if (!isValidCpfOrCnpj(cpfDigits)) {
      toast.error("CPF ou CNPJ inválido");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      toast.error("Informe um telefone válido com DDD");
      return;
    }
    if (inviteCode && !inviteState.valid) {
      toast.error("Código de convite inválido");
      return;
    }
    if (!acceptTerms) {
      toast.error("Você precisa aceitar os termos de uso para continuar");
      return;
    }
    if (planName) {
      try {
        const { data: alreadyUsed } = await (supabase as any).rpc("has_used_trial", { _email: email });
        if (alreadyUsed === true) {
          toast.error("Este email já utilizou o plano de teste. Escolha um plano pago para continuar.");
          navigate("/planos");
          return;
        }
      } catch {}
    }
    setStep(2);
  };

  const executeSignup = async (intent: "trial" | "paid") => {
    setLoading(true);
    const normalizedUsername = normalizeUsername(username);
    const cpfDigits = cpfCnpj.replace(/\D/g, "");
    const phoneDigits = phone.replace(/\D/g, "");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          username: normalizedUsername || null,
          phone: phoneDigits,
          cpf_cnpj: cpfDigits,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    if (data.user) {
      const profileExtra: Record<string, unknown> = {
        display_name: displayName,
        cpf_cnpj: cpfDigits,
        phone: phoneDigits,
        username: normalizedUsername || undefined,
      };
      if (intent === "trial") {
        profileExtra.trial_plan_name = planName || "Profissional";
      }

      if (inviteCode && inviteState.valid) {
        await applyInviteAfterSignup(data.user.id);
        await ensureDefaultClienteRole(data.user.id, data.user.email ?? email, data.session?.access_token, profileExtra);
      } else {
        await ensureDefaultClienteRole(data.user.id, data.user.email ?? email, data.session?.access_token, profileExtra);
      }
    }

    setLoading(false);
    // Avança para o Passo 3 (Tela de Validação de Email)
    setStep(3);
  };

  const handleResendConfirmationEmail = async () => {
    if (!email) return;
    setResendingEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast.error(error.message || "Erro ao reenviar email de confirmação");
      } else {
        toast.success("Link de confirmação reenviado! Verifique sua caixa de entrada.");
      }
    } catch {
      toast.error("Não foi possível reenviar o email no momento.");
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col lg:grid lg:grid-cols-12 overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          COLUNA ESQUERDA: Showcase SaaS / Vitrine (Desktop)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative flex-col justify-between p-8 xl:p-12 bg-gradient-to-br from-card/90 via-card/50 to-background border-r border-border/60 overflow-hidden">
        {/* Glow Effects e Grid de Fundo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-[540px] h-[540px] bg-primary/20 blur-[140px] rounded-full" />
          <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[460px] h-[460px] bg-sky-500/15 blur-[160px] rounded-full" />
          <div className="absolute -bottom-24 left-1/4 w-[420px] h-[420px] bg-primary/15 blur-[120px] rounded-full" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        {/* Topo: Logo & Badge de Plataforma */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <AppLogo area="auth" alt={brandName} />
            <div>
              <span className="text-xl font-bold tracking-tight text-foreground">{brandName}</span>
              <span className="block text-[11px] font-semibold text-primary uppercase tracking-wider">
                Plataforma de Gestão & Crédito
              </span>
            </div>
          </div>
          <div className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sistema Online & Seguro</span>
          </div>
        </div>

        {/* Centro: Chamada de Impacto, Mini Dashboard Preview & Vantagens */}
        <div className="relative z-10 my-auto py-6 max-w-xl space-y-5 animate-fade-in">
          {/* Header Copy */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs font-semibold text-primary backdrop-blur-md shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-spin-slow" />
              <span>Comece em menos de 1 minuto • Sem burocracia</span>
            </div>
            <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-foreground leading-[1.2]">
              Dê adeus às planilhas soltas e escale sua gestão com{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-400 to-primary font-black">
                máxima precisão
              </span>
              .
            </h2>
            <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
              Junte-se a operadores e gestores de crédito que transformaram o controle diário de contratos, recebimentos, taxas e fluxo de caixa.
            </p>
          </div>

          {/* Mini Mockup Visual de Demonstração (Dashboard Fintech Snapshot) */}
          <div className="rounded-2xl bg-card/75 dark:bg-card/45 backdrop-blur-xl border border-border/80 p-4 xl:p-5 shadow-2xl shadow-primary/5 space-y-3.5">
            {/* Cabeçalho do Card */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground block">Carteira sob Gestão</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-foreground">R$ 184.250,00</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <ArrowUpRight className="h-3 w-3" />
                +28.4% no mês
              </span>
            </div>

            {/* Métricas Rápidas */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-background/60 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Contratos Ativos</span>
                <span className="text-xs font-bold text-foreground">48</span>
              </div>
              <div className="p-2 rounded-xl bg-background/60 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Taxa Média</span>
                <span className="text-xs font-bold text-primary">5.2% a.m.</span>
              </div>
              <div className="p-2 rounded-xl bg-background/60 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Inadimplência</span>
                <span className="text-xs font-bold text-emerald-500">&lt; 0.5%</span>
              </div>
            </div>

            {/* Simulação de Contratos Ativos com Baixa Automática */}
            <div className="space-y-1.5 text-xs">
              <div className="p-2.5 rounded-xl bg-background/60 border border-border/60 flex items-center justify-between hover:bg-background/80 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <div>
                    <p className="font-semibold text-foreground text-xs">Contrato #1092 • Lucas Ferreira</p>
                    <p className="text-[10px] text-muted-foreground">Parcela 02/06 recebida via PIX</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-500 text-xs block">+ R$ 1.650,00</span>
                  <span className="text-[9px] font-semibold text-emerald-500/90 uppercase">Baixa Automática</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-background/60 border border-border/60 flex items-center justify-between hover:bg-background/80 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <div>
                    <p className="font-semibold text-foreground text-xs">Contrato #1093 • Amanda Costa</p>
                    <p className="text-[10px] text-muted-foreground">Vencimento em 2 dias</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-foreground text-xs block">R$ 2.400,00</span>
                  <span className="text-[9px] font-semibold text-primary uppercase">Em dia</span>
                </div>
              </div>
            </div>

            {/* Micro Notificação Flutuante */}
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2 text-[11px] text-primary">
              <Bell className="h-3.5 w-3.5 shrink-0 animate-bounce" />
              <span className="font-medium truncate">Aviso preventivo de cobrança disparado com sucesso</span>
            </div>
          </div>

          {/* Destaques Rápidos com Glassmorphism */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-card/50 dark:bg-card/35 backdrop-blur-md border border-border/70 shadow-sm hover:border-primary/40 transition-all">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="p-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Zap className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Acesso Imediato</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Configure sua conta em instantes e comece a cadastrar contratos no mesmo dia.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-card/50 dark:bg-card/35 backdrop-blur-md border border-border/70 shadow-sm hover:border-primary/40 transition-all">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-bold text-foreground">DRE & Lucro Real</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Saiba exatamente seus lucros líquidos, juros auferidos e parcelas a receber.
              </p>
            </div>
          </div>

          {/* Prova Social / Avaliação */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-background/50 border border-border/50 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="font-bold text-foreground">4.9/5</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Aprovado por operadores e gestores de crédito
            </span>
          </div>

          {/* Badges de Confiança */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>Sem fidelidade</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>Criptografia de ponta a ponta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>Backup diário na nuvem</span>
            </div>
          </div>
        </div>

        {/* Rodapé da Coluna Esquerda */}
        <div className="relative z-10 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Dados 100% blindados e confidenciais</span>
          </div>
          <span className="opacity-70">© {new Date().getFullYear()} {brandName}</span>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          COLUNA DIREITA: Formulário de Cadastro (Desktop & Mobile)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="lg:col-span-6 xl:col-span-5 relative flex flex-col justify-center items-center min-h-screen px-4 sm:px-8 py-10 sm:py-14">
        {/* Glow de Fundo para Mobile / Tablet */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[300px] bg-primary/20 blur-3xl rounded-full" />
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[480px] h-[260px] bg-primary/10 blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 w-full max-w-[420px] space-y-6">
          {/* Logo no topo (Apenas visível no Mobile/Tablet) */}
          <div className="lg:hidden text-center space-y-2">
            <div className="relative inline-flex items-center justify-center">
              <AppLogo area="auth" alt={brandName} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{brandName}</h1>
          </div>

          {/* Card de Convite se existir */}
          {inviteCode && step !== 3 && (
            <div
              className={`rounded-2xl border p-4 text-xs sm:text-sm flex items-start gap-2.5 backdrop-blur-md shadow-sm ${
                inviteState.checking
                  ? "border-border/80 bg-muted/50"
                  : inviteState.valid
                  ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-foreground"
              }`}
            >
              {inviteState.checking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />
                  <span>Validando convite…</span>
                </>
              ) : inviteState.valid ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>
                    Convite válido.{" "}
                    {inviteState.require_approval
                      ? "Seu cadastro ficará pendente até aprovação do administrador."
                      : "Você terá acesso imediato após o cadastro."}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>Convite inválido: {inviteState.reason || "código não aceito"}</span>
                </>
              )}
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CARD PRINCIPAL COM GLASSMORPHISM
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="rounded-2xl sm:rounded-3xl border border-border/80 bg-card/75 dark:bg-card/45 backdrop-blur-xl shadow-2xl shadow-primary/5 p-6 sm:p-8 space-y-5 animate-fade-in">
            {/* -------------------- PASSO 3: AVISO DE VALIDAÇÃO DE EMAIL -------------------- */}
            {step === 3 ? (
              <div className="space-y-6 text-center animate-fade-in">
                {/* Ícone de Email com Glow */}
                <div className="relative inline-flex items-center justify-center p-3">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl scale-125" />
                  <div className="relative h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                    <MailCheck className="h-8 w-8" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Quase lá! Confirme seu email
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Enviamos um link de ativação seguro para:
                  </p>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary font-semibold text-xs sm:text-sm max-w-full truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{email}</span>
                  </div>
                </div>

                {/* Caixa de Passos */}
                <div className="rounded-2xl bg-background/70 border border-border/70 p-4 text-left space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Como ativar sua conta:
                  </span>
                  <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>Abra sua caixa de entrada (ou pasta de spam/lixo eletrônico).</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>Clique no botão <strong>"Confirmar meu cadastro"</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>Pronto! Seu acesso ao painel estará liberado.</span>
                    </li>
                  </ul>
                </div>

                {/* Ações */}
                <div className="space-y-3 pt-1">
                  <Button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.99] transition-all duration-200 bg-primary hover:bg-primary/95 text-primary-foreground"
                  >
                    <span className="flex items-center justify-center gap-2">
                      Ir para o Login
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleResendConfirmationEmail}
                    disabled={resendingEmail}
                    className="w-full h-10 rounded-xl text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {resendingEmail ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Reenviando email...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Não recebeu o email? Reenviar link
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Cabeçalho do Card (Passos 1 e 2) */}
                <div className="space-y-1 text-center">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {step === 1 ? "Crie sua conta" : "Escolha como começar"}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {step === 1
                      ? planName
                        ? `Plano selecionado: ${planName}`
                        : "Preencha seus dados para continuar"
                      : "Selecione o tipo de acesso para finalizar"}
                  </p>
                </div>

                {/* -------------------- PASSO 1: DADOS DO USUÁRIO -------------------- */}
                {step === 1 && (
                  <form onSubmit={handleNextStep} className="space-y-4">
                    {/* Nome */}
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-medium text-foreground">
                        Nome Completo
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                        <Input
                          id="name"
                          placeholder="Seu nome ou razão social"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className={`pl-10 ${authInputClass}`}
                          required
                        />
                      </div>
                    </div>

                    {/* Usuário de Login */}
                    <div className="space-y-1.5">
                      <Label htmlFor="username" className="text-xs font-medium text-foreground">
                        Nome de Usuário (login)
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                        <Input
                          id="username"
                          placeholder="seu_usuario"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value.replace(/\s+/g, "").toLowerCase());
                            setUsernameError(null);
                          }}
                          className={`pl-10 ${authInputClass}`}
                          autoCapitalize="none"
                          autoCorrect="off"
                          maxLength={30}
                          required
                        />
                      </div>
                      <p
                        className={`text-xs flex items-center gap-1 ${
                          usernameStatus === "taken" || usernameStatus === "invalid"
                            ? "text-destructive font-medium"
                            : usernameStatus === "available"
                            ? "text-emerald-500 font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {usernameStatus === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {usernameStatus === "available" && <CheckCircle2 className="h-3 w-3" />}
                        {usernameStatus === "taken" || usernameStatus === "invalid"
                          ? usernameError ?? "Usuário indisponível"
                          : usernameStatus === "available"
                          ? "Usuário disponível para uso"
                          : usernameStatus === "checking"
                          ? "Verificando disponibilidade…"
                          : "Você poderá usar esse nome para fazer login no app."}
                      </p>
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-medium text-foreground">
                        Email
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

                    {/* CPF ou CNPJ */}
                    <div className="space-y-1.5">
                      <Label htmlFor="cpfCnpj" className="text-xs font-medium text-foreground">
                        CPF ou CNPJ
                      </Label>
                      <div className="relative">
                        <IdCard className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                        <Input
                          id="cpfCnpj"
                          inputMode="numeric"
                          placeholder="000.000.000-00"
                          value={cpfCnpj}
                          onChange={(e) => setCpfCnpj(formatCpfOrCnpj(e.target.value))}
                          className={`pl-10 ${authInputClass}`}
                          maxLength={18}
                          required
                        />
                      </div>
                    </div>

                    {/* Telefone */}
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-medium text-foreground">
                        Telefone (com DDD)
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                        <Input
                          id="phone"
                          inputMode="tel"
                          placeholder="(11) 99999-9999"
                          value={phone}
                          onChange={(e) => setPhone(formatPhone(e.target.value))}
                          className={`pl-10 ${authInputClass}`}
                          maxLength={16}
                          required
                        />
                      </div>
                    </div>

                    {/* Senha */}
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-xs font-medium text-foreground">
                        Senha de Acesso
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/70 z-10 pointer-events-none" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
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

                    {/* Termos de Uso */}
                    <div className="flex items-start gap-2.5 pt-1">
                      <input
                        id="acceptTerms"
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      />
                      <Label
                        htmlFor="acceptTerms"
                        className="text-xs text-muted-foreground cursor-pointer leading-snug font-normal"
                      >
                        Li e aceito os{" "}
                        <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          termos de uso
                        </a>{" "}
                        e a{" "}
                        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          política de privacidade
                        </a>
                        .
                      </Label>
                    </div>

                    {/* Botão de Avanço */}
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.99] transition-all duration-200 bg-primary hover:bg-primary/95 text-primary-foreground mt-2"
                      disabled={loading || !acceptTerms || (!!inviteCode && !inviteState.valid)}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validando dados...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          Continuar
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      )}
                    </Button>
                  </form>
                )}

                {/* -------------------- PASSO 2: MODALIDADE DE CONTA -------------------- */}
                {step === 2 && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Opção 1: Teste Grátis */}
                    <button
                      type="button"
                      onClick={() => executeSignup("trial")}
                      disabled={loading}
                      className="w-full relative overflow-hidden group text-left rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/60 p-5 shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-primary">
                          <Gift className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-base flex items-center gap-2">
                            Teste Grátis (7 dias)
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            Acesso completo ao sistema por 7 dias, sem cobrança e sem compromisso.
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Opção 2: Plano Pago */}
                    <button
                      type="button"
                      onClick={() => executeSignup("paid")}
                      disabled={loading}
                      className="w-full relative overflow-hidden group text-left rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/60 p-5 shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-emerald-500">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-base">Plano Pago</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            Acesso definitivo. Você escolherá e pagará pelo plano após confirmar sua conta.
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        onClick={() => setStep(1)}
                        disabled={loading}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar aos dados
                      </Button>
                    </div>

                    {loading && (
                      <div className="flex items-center justify-center p-3 text-xs text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span>Criando sua conta com segurança...</span>
                      </div>
                    )}
                  </div>
                )}

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
                    Já tem uma conta?{" "}
                    <button
                      type="button"
                      onClick={() => navigate("/auth")}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors hover:underline"
                    >
                      Entrar
                    </button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 rounded-xl text-sm font-semibold border-primary/40 text-primary hover:bg-primary/10 hover:border-primary transition-all duration-200"
                    onClick={() => navigate("/planos")}
                  >
                    Ver todos os planos
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Rodapé com Selo de Segurança Mobile */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 lg:hidden">
            <ShieldCheck className="h-4 w-4 text-primary/70" />
            <span>Ambiente seguro com criptografia de ponta a ponta</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cadastro;
