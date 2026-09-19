import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Check,
  ArrowRight,
  Shield,
  BarChart3,
  Users,
  Clock,
  Zap,
  Star,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Lock,
  Sparkles,
  HelpCircle,
  CreditCard,
  Flame,
} from "lucide-react";
import { useAsaasCheckout } from "@/hooks/useAsaasCheckout";
import { useAuth } from "@/hooks/useAuth";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { PixPaymentView } from "@/components/billing/PixPaymentView";
import { syncSubscriptionState } from "@/lib/billing/subscriptionSync";
import { CouponInputSection } from "@/components/billing/CouponInputSection";
import type { CouponValidationResult } from "@/hooks/useCouponValidation";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  price_semestral: number | null;
  price_anual: number | null;
  discount_semestral: number | null;
  discount_anual: number | null;
  badge: string | null;
  promo_text: string | null;
  highlight_color: string | null;
  highlight: boolean;
  recommended: boolean;
  features: string[];
  sort_order: number;
  show_monthly: boolean;
  show_semestral: boolean;
  show_anual: boolean;
  is_addon?: boolean;
  addon_key?: string | null;
}

type Cycle = "monthly" | "semestral" | "annual";
const CYCLE_MONTHS: Record<Cycle, number> = { monthly: 1, semestral: 6, annual: 12 };
const CYCLE_LABEL: Record<Cycle, string> = { monthly: "Mensal", semestral: "Semestral", annual: "Anual" };

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const benefits = [
  {
    icon: Zap,
    title: "Gestão Rápida",
    description: "Cadastre empréstimos, clientes e pagamentos em segundos com nossa interface intuitiva.",
  },
  {
    icon: BarChart3,
    title: "Relatórios & DRE",
    description: "Acompanhe lucros, rendimento de juros e inadimplência com gráficos claros em tempo real.",
  },
  {
    icon: Users,
    title: "Multi-usuários",
    description: "Adicione operadores e visualizadores com permissões personalizadas por função.",
  },
  {
    icon: Shield,
    title: "Segurança Total",
    description: "Seus dados protegidos com criptografia de ponta a ponta e backup automático contínuo.",
  },
  {
    icon: Clock,
    title: "Automação Inteligente",
    description: "Alertas automáticos de parcelas a vencer, lembretes de cobrança e resumos operacionais.",
  },
  {
    icon: CreditCard,
    title: "Fluxo de Caixa & Livro Caixa",
    description: "Controle entradas, saídas, simulação de impostos e despesas consolidadas em um só lugar.",
  },
];

const testimonials = [
  {
    name: "Carlos M.",
    role: "Agente de crédito",
    text: "Antes eu controlava tudo em cadernos e planilhas soltas. Com o EmprestAI, reduzi a inadimplência em 40% e nunca mais perdi uma cobrança.",
    stars: 5,
  },
  {
    name: "Fernanda S.",
    role: "Empresária",
    text: "O sistema é extremamente ágil. Consigo ver em tempo real quanto tenho a receber e meus lucros líquidos com a separação de juros.",
    stars: 5,
  },
  {
    name: "Roberto L.",
    role: "Gestor Financeiro",
    text: "A função de multi-usuários foi um divisor de águas. Minha equipe toda usa com permissões bem divididas e muita segurança.",
    stars: 5,
  },
];

const faqs = [
  {
    question: "Quais são as formas de pagamento aceitas?",
    answer:
      "Aceitamos PIX com liberação instantânea e Cartão de Crédito. Todos os pagamentos são processados em ambiente 100% seguro e criptografado.",
  },
  {
    question: "Como funciona o cancelamento?",
    answer:
      "Não há fidelidade nem contratos longos com multas. Você pode cancelar sua assinatura a qualquer momento com apenas um clique nas configurações da sua conta.",
  },
  {
    question: "Posso mudar de plano mais tarde?",
    answer:
      "Sim! Você pode fazer upgrade ou downgrade de plano a qualquer momento. A transição é simples e você não perde nenhum dado cadastrado.",
  },
  {
    question: "Meus dados financeiros estão seguros?",
    answer:
      "Absolutamente. Utilizamos criptografia de nível bancário, autenticação moderna, isolamento total de dados entre contas e backups automatizados diários.",
  },
  {
    question: "Preciso instalar algum programa no computador?",
    answer:
      "Não. O EmprestAI é uma plataforma 100% em nuvem acessível diretamente pelo navegador do seu computador, tablet ou celular, além de funcionar perfeitamente como aplicativo (PWA).",
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const { mutate, isPending, data: checkoutData, reset } = useAsaasCheckout();
  const { user } = useAuth();
  const { branding } = useAppBranding();
  const { profile } = useAccountProfile();
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select(
        "id, name, description, price, price_semestral, price_anual, discount_semestral, discount_anual, badge, promo_text, highlight_color, highlight, recommended, features, sort_order, show_monthly, show_semestral, show_anual, is_addon, addon_key"
      )
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          const mainPlans = (data as unknown as any[]).filter(
            (p) => !p.is_addon && !p.addon_key && !/telegram/i.test(p.name || "")
          );
          setPlans(
            mainPlans.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description ?? null,
              price: Number(p.price) || 0,
              price_semestral: p.price_semestral != null ? Number(p.price_semestral) : null,
              price_anual: p.price_anual != null ? Number(p.price_anual) : null,
              discount_semestral: p.discount_semestral != null ? Number(p.discount_semestral) : 0,
              discount_anual: p.discount_anual != null ? Number(p.discount_anual) : 0,
              badge: p.badge ?? null,
              promo_text: p.promo_text ?? null,
              highlight_color: p.highlight_color ?? null,
              highlight: !!p.highlight,
              recommended: !!p.recommended,
              features: p.features ?? [],
              sort_order: p.sort_order ?? 0,
              show_monthly: p.show_monthly ?? true,
              show_semestral: p.show_semestral ?? true,
              show_anual: p.show_anual ?? true,
              is_addon: !!p.is_addon,
              addon_key: p.addon_key ?? null,
            }))
          );
        }
        setLoading(false);
      });
  }, []);

  const scrollToPlans = (behavior: ScrollBehavior = "smooth") => {
    const el = document.getElementById("planos");
    if (el) {
      el.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    const shouldScroll = window.location.hash === "#planos" || Boolean(user);
    if (shouldScroll) {
      scrollToPlans(window.location.hash === "#planos" ? "smooth" : "auto");
      const t1 = setTimeout(() => scrollToPlans("smooth"), 100);
      const t2 = setTimeout(() => scrollToPlans("smooth"), 350);
      const t3 = setTimeout(() => scrollToPlans("smooth"), 700);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [loading, user]);

  const handleSubscribe = async (plan: Plan, totalPrice: number) => {
    const isFreeOrTrial =
      totalPrice === 0 ||
      plan.price === 0 ||
      /grátis|gratis|teste|trial|free/i.test(plan.name) ||
      /grátis|gratis|teste|trial|free/i.test(plan.badge || "");

    if (!user) {
      navigate("/cadastro");
      return;
    }

    if (isFreeOrTrial) {
      navigate("/");
      return;
    }

    setCheckoutPlan(plan.name);
    mutate({ planId: plan.id, cycle, couponCode: appliedCoupon?.code });
  };

  const handlePayWithCard = async (cardData: any, holderInfo: any) => {
    const targetPlan = plans.find((p) => p.name === checkoutPlan);
    if (!targetPlan) return;
    mutate({
      planId: targetPlan.id,
      cycle,
      paymentMethod: "CREDIT_CARD",
      creditCard: cardData,
      creditCardHolderInfo: holderInfo,
      couponCode: appliedCoupon?.code,
    });
  };

  const handleBackToPlans = () => {
    reset();
    setCheckoutPlan(null);
  };

  // Calcula descontos reais cadastrados para exibição dinâmica no seletor
  const semestralDiscounts = plans
    .filter((p) => p.show_semestral && p.price > 0)
    .map((p) => {
      if (p.discount_semestral != null && p.discount_semestral > 0) {
        return Math.round(p.discount_semestral);
      }
      if (p.price_semestral != null && p.price_semestral > 0 && p.price > 0) {
        const original = p.price * 6;
        return Math.round(((original - p.price_semestral) / original) * 100);
      }
      return 0;
    })
    .filter((d) => d > 0);

  const annualDiscounts = plans
    .filter((p) => p.show_anual && p.price > 0)
    .map((p) => {
      if (p.discount_anual != null && p.discount_anual > 0) {
        return Math.round(p.discount_anual);
      }
      if (p.price_anual != null && p.price_anual > 0 && p.price > 0) {
        const original = p.price * 12;
        return Math.round(((original - p.price_anual) / original) * 100);
      }
      return 0;
    })
    .filter((d) => d > 0);

  const maxSemestralDiscount = semestralDiscounts.length > 0 ? Math.max(...semestralDiscounts) : 0;
  const maxAnnualDiscount = annualDiscounts.length > 0 ? Math.max(...annualDiscounts) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HEADER FIXO COM GLASSMORPHISM
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-50 pt-safe transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <AppLogo area="header" alt={branding.brand_name} />
            <span className="text-lg font-bold tracking-tight text-foreground">{branding.brand_name}</span>
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => scrollToPlans()} className="text-sm font-medium hidden sm:inline-flex">
              Planos
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(user ? "/" : "/auth")}
              className="rounded-xl border-border/80 hover:bg-muted font-medium text-sm"
            >
              {user ? "Acessar Painel" : "Entrar"}
            </Button>
          </div>
        </div>
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO SECTION COM GLOW ORBS TECH
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden pt-12 pb-10 sm:pt-24 sm:pb-20 text-center">
        {/* Glow Orbs & Grid de Fundo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[360px] bg-gradient-to-b from-primary/25 via-sky-500/10 to-transparent blur-3xl rounded-full opacity-70" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10 space-y-5 sm:space-y-6">
          {/* Badge informativo: apenas visível em telas maiores (oculto no mobile) */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs sm:text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            <span>Planos Flexíveis • Sem Fidelidade • Cancele Quando Quiser</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            Controle seus empréstimos <br />
            <span className="text-primary">com máxima precisão</span>
          </h1>

          <p className="text-muted-foreground text-sm sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            A plataforma completa para gerenciar contratos, automatizar avisos e acompanhar seus lucros em tempo real.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => scrollToPlans()}
              className="w-full max-w-[260px] sm:max-w-none sm:w-auto h-10 sm:h-12 px-5 sm:px-8 rounded-xl font-semibold shadow-md sm:shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all text-sm sm:text-base bg-primary hover:bg-primary/95 text-primary-foreground"
            >
              Ver Planos e Preços <ArrowRight className="ml-1.5 sm:ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="w-full max-w-[260px] sm:max-w-none sm:w-auto h-10 sm:h-12 px-5 sm:px-8 rounded-xl font-semibold border-border/80 hover:bg-muted text-sm sm:text-base"
            >
              Já tenho uma conta
            </Button>
          </div>

          <div className="pt-4 sm:pt-6">
            <button
              onClick={() => scrollToPlans()}
              className="inline-flex flex-col items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Escolha o melhor plano abaixo</span>
              <ChevronDown className="h-4 w-4 animate-bounce mt-1 text-primary" />
            </button>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SEÇÃO DE PLANOS & CHECKOUT
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="planos" className="relative py-14 sm:py-24 border-y border-border/40 bg-muted/20 scroll-mt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {checkoutData ? (
            <div className="animate-fade-in">
              <PixPaymentView
                checkoutData={checkoutData}
                planName={checkoutPlan || "Plano Selecionado"}
                cycleLabel={CYCLE_LABEL[cycle]}
                onBackToPlans={handleBackToPlans}
                onGenerateNewPix={() => {
                  const targetPlan = plans.find((p) => p.name === checkoutPlan);
                  if (targetPlan) {
                    reset();
                    mutate({ planId: targetPlan.id, cycle, couponCode: appliedCoupon?.code });
                  } else {
                    handleBackToPlans();
                  }
                }}
                onPayWithCard={handlePayWithCard}
                isCardProcessing={isPending}
                initialCpf={profile?.cpf_cnpj || ""}
                initialName={profile?.display_name || user?.email || ""}
                initialEmail={user?.email || ""}
              />
            </div>
          ) : (
            <>
              <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                  Escolha o plano ideal para você
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Liberação imediata da sua conta. Todos os recursos essenciais para escalar suas operações.
                </p>

                {/* Seletor de Ciclo Dinâmico em Cápsula */}
                <div className="pt-4 flex justify-center">
                  <div className="inline-flex items-center p-1.5 rounded-2xl bg-card/80 border border-border/80 shadow-md backdrop-blur-md">
                    {(["monthly", "semestral", "annual"] as Cycle[]).map((c) => {
                      const isSelected = cycle === c;
                      return (
                        <button
                          key={c}
                          onClick={() => setCycle(c)}
                          className={`relative px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          <span>{CYCLE_LABEL[c]}</span>
                          {c === "semestral" && maxSemestralDiscount > 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                isSelected ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                              }`}
                            >
                              -{maxSemestralDiscount}%
                            </span>
                          )}
                          {c === "annual" && maxAnnualDiscount > 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                isSelected ? "bg-white/20 text-white" : "bg-emerald-500/20 text-emerald-500"
                              }`}
                            >
                              -{maxAnnualDiscount}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Cupom de Desconto */}
              <div className="max-w-md mx-auto mb-12">
                <div className="p-3.5 rounded-2xl bg-card/60 backdrop-blur-md border border-border/70 shadow-sm">
                  <CouponInputSection
                    planId={plans.find((p) => p.price > 0)?.id || plans[0]?.id || ""}
                    cycle={cycle}
                    userId={user?.id}
                    appliedCoupon={appliedCoupon}
                    onCouponApplied={setAppliedCoupon}
                  />
                </div>
              </div>

              {/* Grid dos Cards de Planos */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm">Carregando planos disponíveis...</span>
                </div>
              ) : (() => {
                const visiblePlans = plans.filter((p) => {
                  if (user && p.name.toLowerCase().includes("teste")) return false;
                  return cycle === "monthly"
                    ? p.show_monthly
                    : cycle === "semestral"
                    ? p.show_semestral
                    : p.show_anual;
                });

                if (visiblePlans.length === 0) {
                  return (
                    <div className="text-center py-16 text-muted-foreground bg-card/40 rounded-2xl border border-border/60 max-w-lg mx-auto p-6">
                      Nenhum plano disponível para esta modalidade no momento.
                    </div>
                  );
                }

                return (
                  <div
                    className={`grid gap-6 mx-auto items-stretch ${
                      visiblePlans.length === 1
                        ? "grid-cols-1 max-w-md"
                        : visiblePlans.length === 2
                        ? "grid-cols-1 sm:grid-cols-2 max-w-3xl"
                        : visiblePlans.length === 3
                        ? "grid-cols-1 md:grid-cols-3 max-w-6xl"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-7xl"
                    }`}
                  >
                    {visiblePlans.map((plan) => {
                      const isLoading = isPending && checkoutPlan === plan.name;
                      const months = CYCLE_MONTHS[cycle];
                      const discount =
                        cycle === "semestral"
                          ? plan.discount_semestral ?? 0
                          : cycle === "annual"
                          ? plan.discount_anual ?? 0
                          : 0;
                      const override =
                        cycle === "semestral"
                          ? plan.price_semestral
                          : cycle === "annual"
                          ? plan.price_anual
                          : null;
                      const basePrice =
                        override && override > 0 ? override : plan.price * months * (1 - discount / 100);

                      const isCouponApplicable = Boolean(
                        appliedCoupon?.valid &&
                          (!appliedCoupon.applicable_plan_ids ||
                            appliedCoupon.applicable_plan_ids.length === 0 ||
                            appliedCoupon.applicable_plan_ids.includes(plan.id))
                      );

                      let couponDiscount = 0;
                      if (isCouponApplicable && appliedCoupon) {
                        if (appliedCoupon.discount_type === "percentage") {
                          couponDiscount =
                            Math.round(((basePrice * Number(appliedCoupon.discount_value)) / 100) * 100) / 100;
                        } else {
                          couponDiscount = Math.min(Number(appliedCoupon.discount_value), basePrice);
                        }
                      }

                      const totalPrice = Math.max(0, basePrice - couponDiscount);
                      const originalTotal = plan.price * months;
                      const saved = Math.max(originalTotal - totalPrice, 0);
                      const equivMonthly = totalPrice / months;
                      const isFeatured = plan.recommended || plan.highlight;
                      const badgeText = plan.badge || (plan.highlight ? "Mais Popular" : null);

                      return (
                        <div
                          key={plan.id}
                          className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                            isFeatured
                              ? "bg-card/90 dark:bg-card/75 border-2 border-primary shadow-2xl shadow-primary/15 sm:-translate-y-2"
                              : "bg-card/70 dark:bg-card/45 border border-border/80 shadow-lg hover:border-primary/50 hover:shadow-xl"
                          } backdrop-blur-xl`}
                        >
                          {/* Badge do Plano Mais Popular / Recomendado */}
                          {badgeText && (
                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground shadow-md shadow-primary/30 flex items-center gap-1.5">
                              <Flame className="h-3.5 w-3.5" />
                              <span>{badgeText}</span>
                            </div>
                          )}

                          <div>
                            {/* Nome & Descrição */}
                            <div className="text-center pb-4 border-b border-border/50">
                              <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                              {plan.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {plan.description}
                                </p>
                              )}

                              {/* Bloco de Preços */}
                              <div className="mt-4 flex flex-col items-center justify-center">
                                {(months > 1 || couponDiscount > 0) && saved > 0 && (
                                  <span className="text-xs text-muted-foreground line-through font-medium">
                                    {formatBRL(originalTotal)}
                                  </span>
                                )}
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                                    {formatBRL(totalPrice)}
                                  </span>
                                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                                    /{CYCLE_LABEL[cycle].toLowerCase()}
                                  </span>
                                </div>

                                {months > 1 && (
                                  <div className="text-xs font-medium text-primary mt-1">
                                    Equivale a <strong className="font-bold">{formatBRL(equivMonthly)}</strong>/mês
                                  </div>
                                )}

                                {couponDiscount > 0 && (
                                  <div className="text-xs font-semibold mt-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    Cupom {appliedCoupon?.code}: -{formatBRL(couponDiscount)}
                                  </div>
                                )}

                                {saved > 0 && couponDiscount === 0 && (
                                  <div className="text-xs font-semibold mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    Economia de {formatBRL(saved)} ({((saved / originalTotal) * 100).toFixed(0)}%)
                                  </div>
                                )}

                                {plan.promo_text && (
                                  <div className="text-xs font-semibold mt-2 text-foreground/90">
                                    {plan.promo_text}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Lista de Funcionalidades */}
                            <div className="py-6 space-y-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                O que está incluso:
                              </span>
                              <ul className="space-y-2.5">
                                {plan.features.map((f, idx) => (
                                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-muted-foreground">
                                    <div className="p-0.5 rounded-full bg-primary/10 text-primary shrink-0 mt-0.5">
                                      <Check className="h-3.5 w-3.5" />
                                    </div>
                                    <span className="leading-snug">{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Botão de Assinatura */}
                          <div className="pt-2">
                            {(() => {
                              const isFreeOrTrial =
                                totalPrice === 0 ||
                                plan.price === 0 ||
                                /grátis|gratis|teste|trial|free/i.test(plan.name) ||
                                /grátis|gratis|teste|trial|free/i.test(plan.badge || "");

                              return (
                                <Button
                                  className={`w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 ${
                                    isFeatured
                                      ? "bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/35"
                                      : "border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                                  }`}
                                  variant={isFeatured ? "default" : "outline"}
                                  onClick={() => handleSubscribe(plan, totalPrice)}
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <span className="flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Gerando PIX...
                                    </span>
                                  ) : (
                                    <span className="flex items-center justify-center gap-1.5">
                                      {isFreeOrTrial ? "Começar Teste Grátis" : "Assinar Agora"}
                                      <ArrowRight className="h-4 w-4" />
                                    </span>
                                  )}
                                </Button>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Banner de Garantia & Confiança */}
              <div className="mt-16 max-w-4xl mx-auto rounded-3xl bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/80 p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary mb-1">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground">Sem Fidelidade</h4>
                  <p className="text-xs text-muted-foreground">Cancele quando quiser diretamente no painel.</p>
                </div>

                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-1">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground">Liberação Instantânea</h4>
                  <p className="text-xs text-muted-foreground">Acesso liberado no segundo seguinte após o pagamento.</p>
                </div>

                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary mb-1">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground">Pagamento Seguro</h4>
                  <p className="text-xs text-muted-foreground">Transações 100% criptografadas via PIX e Cartão.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          BENEFÍCIOS DA PLATAFORMA
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Tudo o que você precisa em um só lugar
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Desenvolvido sob medida para simplificar e profissionalizar suas operações de crédito e finanças.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="p-6 rounded-3xl bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/80 hover:border-primary/40 shadow-sm hover:shadow-lg transition-all space-y-3"
            >
              <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-foreground text-lg">{b.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          DEPOIMENTOS DE CLIENTES
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 bg-muted/20 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-12 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Quem usa, recomenda
            </h2>
            <p className="text-sm text-muted-foreground">
              Veja a experiência de quem já transformou sua gestão diária.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="p-6 rounded-3xl bg-card/70 dark:bg-card/45 backdrop-blur-xl border border-border/80 shadow-md flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center gap-1">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-foreground/90 text-sm leading-relaxed italic">"{t.text}"</p>
                <div className="pt-3 border-t border-border/50">
                  <p className="font-bold text-foreground text-sm">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          PERGUNTAS FREQUENTES (FAQ)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Dúvidas Comuns</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Perguntas Frequentes
          </h2>
          <p className="text-sm text-muted-foreground">
            Tire todas as suas dúvidas antes de assinar.
          </p>
        </div>

        <div className="rounded-3xl bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/80 p-6 sm:p-8 shadow-sm">
          <Accordion type="single" collapsible className="w-full space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border/50">
                <AccordionTrigger className="text-left text-sm sm:text-base font-semibold text-foreground hover:text-primary transition-colors py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pt-1">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CTA FINAL
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 bg-gradient-to-b from-transparent to-primary/10 border-t border-border/40 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-5">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Pronto para revolucionar seu controle financeiro?
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            Escolha o plano que melhor se adapta à sua rotina e comece a gerenciar tudo em minutos.
          </p>
          <Button
            size="lg"
            onClick={() => scrollToPlans()}
            className="h-10 sm:h-12 px-6 sm:px-8 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all text-sm sm:text-base bg-primary hover:bg-primary/95 text-primary-foreground"
          >
            Começar Agora <ArrowRight className="ml-1.5 sm:ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          RODAPÉ
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="border-t border-border/40 bg-card/60 backdrop-blur-xl py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <AppLogo area="header" alt={branding.brand_name} className="h-5 w-auto" />
            <span>
              {branding.brand_name} © {new Date().getFullYear()} • Todos os direitos reservados
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 font-medium">
            <button onClick={() => navigate("/auth")} className="hover:text-foreground transition-colors">
              Entrar
            </button>
            <button onClick={() => scrollToPlans()} className="hover:text-foreground transition-colors">
              Planos
            </button>
            <button onClick={() => navigate("/termos")} className="hover:text-foreground transition-colors">
              Termos de Uso
            </button>
            <button onClick={() => navigate("/reembolso")} className="hover:text-foreground transition-colors">
              Reembolso
            </button>
            <button onClick={() => navigate("/privacidade")} className="hover:text-foreground transition-colors">
              Privacidade
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
