import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Copy,
  CheckCircle2,
  RefreshCw,
  QrCode,
  ArrowLeft,
} from "lucide-react";
import { useAsaasCheckout } from "@/hooks/useAsaasCheckout";
import { useAuth } from "@/hooks/useAuth";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import logoIcon from "@/assets/logo-icon.png";

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
    title: "Relatórios Completos",
    description: "Acompanhe lucros, juros e inadimplência com gráficos claros e atualizados em tempo real.",
  },
  {
    icon: Users,
    title: "Multi-usuários",
    description: "Adicione operadores e visualizadores com permissões personalizadas por cliente.",
  },
  {
    icon: Shield,
    title: "Segurança Total",
    description: "Seus dados protegidos com criptografia e backup automático na nuvem.",
  },
  {
    icon: Clock,
    title: "Cobranças Automáticas",
    description: "Receba alertas de parcelas vencidas e relatórios automáticos via Telegram.",
  },
  {
    icon: Shield,
    title: "Controle Financeiro",
    description: "Gerencie despesas, saldo e fluxo de caixa em um só lugar.",
  },
];

const testimonials = [
  {
    name: "Carlos M.",
    role: "Agente de crédito",
    text: "Antes eu controlava tudo em cadernos. Com o EmprestAI, reduzi a inadimplência em 40% e nunca mais perdi uma cobrança.",
    stars: 5,
  },
  {
    name: "Fernanda S.",
    role: "Empresária",
    text: "O sistema é muito fácil de usar. Consigo ver em tempo real quanto tenho a receber e meus lucros mensais. Recomendo demais!",
    stars: 5,
  },
  {
    name: "Roberto L.",
    role: "Financeiro autônomo",
    text: "A função de multi-usuários foi um divisor de águas. Minha equipe toda usa e cada um vê só o que precisa.",
    stars: 5,
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
  const { profile, refetch } = useAccountProfile();
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("plans")
      .select("id, name, description, price, price_semestral, price_anual, discount_semestral, discount_anual, badge, promo_text, highlight_color, highlight, recommended, features, sort_order, show_monthly, show_semestral, show_anual")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }: { data: any[] | null }) => {
        if (data) {
          setPlans(data.map((p) => ({
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
          })));
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
      // Executa de forma resiliente assim que o DOM estiver pronto
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
    // O preço é resolvido no servidor a partir de planId + cycle.
    mutate({ planId: plan.id, cycle });
  };


  const handleCopyPayload = () => {
    const payload = checkoutData?.pix?.payload;
    if (!payload) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePaymentDone = async () => {
    setCheckingPayment(true);

    // Invalida explicitamente o cache do perfil para forçar uma nova leitura
    // após o pagamento, quebrando o stale state de "Sem plano ativo".
    await queryClient.invalidateQueries({ queryKey: ["profile"] });

    const checkIsActive = async () => {
      const freshProfile = await refetch();
      if (checkoutData?.paymentId) {
        return freshProfile?.last_payment_id === checkoutData.paymentId;
      }
      return freshProfile?.financial_status === "ACTIVE";
    };

    if (await checkIsActive()) {
      setCheckingPayment(false);
      navigate("/");
      return;
    }

    const maxAttempts = 50;
    let attempts = 0;

    const poll = () => {
      setTimeout(async () => {
        attempts++;
        if (await checkIsActive()) {
          setCheckingPayment(false);
          navigate("/");
        } else if (attempts >= maxAttempts) {
          setCheckingPayment(false);
          toast({
            title: "Pagamento não confirmado",
            description: "Ainda não identificamos o pagamento desse PIX. Se você já pagou, aguarde alguns segundos e tente novamente.",
            variant: "destructive",
          });
        } else {
          poll();
        }
      }, 100);
    };

    poll();
  };

  const handleBackToPlans = () => {
    reset();
    setCheckoutPlan(null);
  };

  return (
    <div className="min-h-screen bg-background">



      {/* Header */}
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/80 sticky top-0 z-50 pt-safe">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2">
            <img src={logoIcon} alt="EmprestAI" className="h-9 w-9 rounded-xl" width={36} height={36} />
            <span className="text-lg font-bold text-foreground">EmprestAI</span>
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => scrollToPlans()} className="hidden sm:inline-flex">
              Planos
            </Button>
            <Button variant="outline" onClick={() => navigate(user ? "/" : "/auth")}>
              Entrar
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="h-3.5 w-3.5" />
            Gestão de empréstimos simplificada
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Controle seus empréstimos
            <br />
            <span className="text-primary">com inteligência</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Plataforma completa para gerenciar empréstimos, clientes e finanças.
            Automatize cobranças, acompanhe pagamentos e maximize seus lucros.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => scrollToPlans()} className="text-base px-8">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-base px-8">
              Já tenho conta
            </Button>
          </div>
          <button
            onClick={() => scrollToPlans()}
            className="mt-16 mx-auto flex flex-col items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-xs mb-1">Saiba mais</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </button>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-muted/30 border-y border-border/20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
            Funcionalidades pensadas para quem trabalha com empréstimos e precisa de controle total.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b) => (
              <Card key={b.title} no3d className="bg-card/60 hover:bg-card transition-colors">
                <CardContent className="p-6 flex flex-col gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <b.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg">{b.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
          Quem usa, recomenda
        </h2>
        <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
          Veja o que nossos clientes dizem sobre o EmprestAI.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <Card key={t.name} no3d className="bg-card/60">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-foreground text-sm leading-relaxed italic">"{t.text}"</p>
                <div className="mt-auto pt-2 border-t border-border/30">
                  <p className="font-semibold text-foreground text-sm">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing / Checkout */}
      <section id="planos" className="bg-muted/30 border-y border-border/20 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6 py-20">
          {checkoutData ? (
            <div className="max-w-md mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-4">
                  <QrCode className="h-6 w-6" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                  Pagamento via PIX
                </h2>
                <p className="text-muted-foreground">
                  Escaneie o QR Code no app do seu banco ou copie o código abaixo.
                </p>
              </div>

              <Card no3d className="overflow-hidden">
                <CardContent className="p-6 flex flex-col gap-6">
                  {checkoutData.pix?.encodedImage ? (
                    <div className="flex justify-center">
                      <img
                        src={`data:image/png;base64,${checkoutData.pix.encodedImage}`}
                        alt="QR Code PIX"
                        className="w-48 h-48 sm:w-64 sm:h-64 max-w-full max-h-64 object-contain rounded-lg border border-border/40 bg-white shadow-xs"
                      />
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      QR Code não disponível. Copie o código abaixo.
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pix-payload">Código PIX Copia e Cola</Label>
                    <div className="flex gap-2">
                      <Input
                        id="pix-payload"
                        readOnly
                        value={checkoutData.pix?.payload || "Código não disponível"}
                        className="font-mono text-xs truncate"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPayload}
                        disabled={!checkoutData.pix?.payload}
                        aria-label="Copiar código PIX"
                      >
                        {copied ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {copied && (
                      <p className="text-xs text-green-500">Código copiado!</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={handlePaymentDone}
                      disabled={checkingPayment}
                    >
                      {checkingPayment ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Já realizei o pagamento
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={handleBackToPlans}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar aos planos
                    </Button>
                  </div>

                  {checkoutData.invoiceUrl && (
                    <p className="text-center text-xs text-muted-foreground">
                      Também é possível pagar pelo{" "}
                      <a
                        href={checkoutData.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        link da cobrança
                      </a>
                      .
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
                Escolha o plano ideal para você
              </h2>
              <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-14">
                Comece hoje mesmo. Sem contratos, cancele quando quiser.
              </p>
              {/* Cycle toggle */}
              <div className="flex justify-center mb-10">
                <div className="inline-flex rounded-full border border-border/40 bg-card p-1">
                  {(["monthly", "semestral", "annual"] as Cycle[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCycle(c)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                        cycle === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {CYCLE_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando planos...</div>
              ) : (() => {
                const visiblePlans = plans.filter((p) => {
                  if (user && p.name.toLowerCase().includes("teste")) return false;
                  return cycle === "monthly" ? p.show_monthly :
                    cycle === "semestral" ? p.show_semestral :
                    p.show_anual;
                });
                if (visiblePlans.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhum plano disponível para esta modalidade.
                    </div>
                  );
                }
                return (
                <div
                  className={`grid gap-6 mx-auto justify-center items-stretch ${
                    visiblePlans.length === 1
                      ? "grid-cols-1 max-w-md"
                      : visiblePlans.length === 2
                      ? "grid-cols-1 sm:grid-cols-2 max-w-3xl"
                      : visiblePlans.length === 3
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl"
                      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-7xl"
                  }`}
                >
                  {visiblePlans.map((plan) => {
                    const isLoading = isPending && checkoutPlan === plan.name;
                    const months = CYCLE_MONTHS[cycle];
                    const discount = cycle === "semestral" ? (plan.discount_semestral ?? 0)
                      : cycle === "annual" ? (plan.discount_anual ?? 0) : 0;
                    const override = cycle === "semestral" ? plan.price_semestral
                      : cycle === "annual" ? plan.price_anual : null;
                    const totalPrice = override && override > 0
                      ? override
                      : plan.price * months * (1 - discount / 100);
                    const originalTotal = plan.price * months;
                    const saved = Math.max(originalTotal - totalPrice, 0);
                    const equivMonthly = totalPrice / months;
                    const isFeatured = plan.recommended || plan.highlight;
                    const accent = plan.highlight_color;
                    const badgeText = plan.badge || (plan.highlight ? "Mais popular" : null);

                    return (
                      <Card
                        key={plan.id}
                        no3d
                        className={`flex flex-col relative ${
                          isFeatured ? "shadow-[0_0_30px_-8px_hsl(var(--primary)/0.3)]" : ""
                        }`}
                        style={isFeatured && accent
                          ? { borderColor: accent, boxShadow: `0 0 30px -8px ${accent}` }
                          : undefined}
                      >
                        {badgeText && (
                          <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold text-primary-foreground"
                            style={accent ? { background: accent } : undefined}
                          >
                            {badgeText}
                          </div>
                        )}
                        <CardHeader className="text-center pb-2">
                          <CardTitle className="text-xl">{plan.name}</CardTitle>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                          )}
                          <div className="mt-4">
                            {months > 1 && saved > 0 && (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatBRL(originalTotal)}
                              </div>
                            )}
                            <span className="text-4xl font-bold text-foreground">{formatBRL(totalPrice)}</span>
                            <span className="text-muted-foreground text-sm"></span>
                            {months > 1 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                equivale a {formatBRL(equivMonthly)}/mês
                              </div>
                            )}
                            {saved > 0 && (
                              <div className="text-xs font-semibold mt-1" style={accent ? { color: accent } : { color: "hsl(var(--primary))" }}>
                                Economize {formatBRL(saved)} ({((saved / originalTotal) * 100).toFixed(0)}%)
                              </div>
                            )}
                            {plan.promo_text && (
                              <div className="text-xs font-medium mt-1 text-foreground">{plan.promo_text}</div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-1">
                          <ul className="space-y-3 flex-1">
                            {plan.features.map((f) => (
                              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          {(() => {
                            const isFreeOrTrial =
                              totalPrice === 0 ||
                              plan.price === 0 ||
                              /grátis|gratis|teste|trial|free/i.test(plan.name) ||
                              /grátis|gratis|teste|trial|free/i.test(plan.badge || "");

                            return (
                              <Button
                                className="w-full rounded-full text-base py-6 font-semibold mt-6"
                                onClick={() => handleSubscribe(plan, totalPrice)}
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Gerando PIX...
                                  </>
                                ) : (
                                  <>
                                    {isFreeOrTrial ? "Testar agora" : "Assinar agora"}{" "}
                                    <ArrowRight className="h-4 w-4" />
                                  </>
                                )}
                              </Button>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                );
              })()}
            </>
          )}
        </div>
      </section>

      {/* CTA Final */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
          Pronto para organizar suas finanças?
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8">
          Crie sua conta gratuitamente e comece a gerenciar seus empréstimos com mais controle e menos dor de cabeça.
        </p>
        <Button size="lg" onClick={() => scrollToPlans()} className="text-base px-8">
          Criar conta grátis <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 bg-muted/20">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logoIcon} alt="EmprestAI" className="h-4 w-4 rounded" width={16} height={16} />
            <span>EmprestAI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-6">
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
