import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase as userSupabase } from "@/integrations/supabase/userClient";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { toast } from "sonner";
import { Loader2, CheckCircle2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { resolvePersonalIcon, personalCategories, getIconName } from "@/features/financial/lib/personalExpenseCategories";

async function invokeSeed<T = unknown>(body: Record<string, unknown>) {
  // Edge function is deployed on Lovable Cloud, but JWT belongs to the external project.
  // Pass the external session token explicitly so the function can validate it.
  const { data: sess } = await userSupabase.auth.getSession();
  const token = sess.session?.access_token;
  return userSupabase.functions.invoke<T>("seed-new-user", {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

interface PreviewCat { name: string; icon: string; color: string }
interface PreviewResponse {
  ok: boolean;
  expense: PreviewCat[];
  income: PreviewCat[];
  note?: string;
}

// Local fallback list — always available, even if the edge function fails.
const LOCAL_EXPENSE: PreviewCat[] = personalCategories.map((c) => ({
  name: c.name,
  icon: getIconName(c.icon),
  color: c.color,
}));

const STEPS = 3;

export default function Welcome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || user?.user_metadata?.full_name || "");
  const [businessName, setBusinessName] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [excludedExp, setExcludedExp] = useState<Set<string>>(new Set());
  const [excludedInc, setExcludedInc] = useState<Set<string>>(new Set());

  const [previewTried, setPreviewTried] = useState(false);

  // Load preview when reaching step 2. Try the edge function first (owner's
  // real categories); if it fails or returns nothing, fall back to the local
  // default list so the user always sees options.
  useEffect(() => {
    if (step !== 2 || preview || loadingPreview || previewTried) return;
    (async () => {
      setLoadingPreview(true);
      const { data, error } = await invokeSeed<PreviewResponse>({ mode: "preview" });
      setLoadingPreview(false);
      setPreviewTried(true);
      const hasRemote = !error && data?.ok && (data.expense?.length || data.income?.length);
      if (hasRemote) {
        setPreview(data!);
      } else {
        setPreview({ ok: true, expense: LOCAL_EXPENSE, income: [] });
      }
    })();
  }, [step, preview, loadingPreview, previewTried]);

  const toggleExp = (name: string) => {
    setExcludedExp((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  const toggleInc = (name: string) => {
    setExcludedInc((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };

  const selectedExpense = useMemo(
    () => (preview?.expense ?? []).filter((c) => !excludedExp.has(c.name)),
    [preview, excludedExp],
  );
  const selectedIncome = useMemo(
    () => (preview?.income ?? []).filter((c) => !excludedInc.has(c.name)),
    [preview, excludedInc],
  );

  const handleFinish = async () => {
    if (!displayName.trim()) {
      toast.error("Informe seu nome.");
      setStep(1);
      return;
    }
    if (!user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setSubmitting(true);

    // 1) Try the edge function (copies owner's real categories if available).
    const { data, error } = await invokeSeed<{ ok: boolean; insertedExpenseCategories?: number }>({
      mode: "apply",
      displayName: displayName.trim(),
      businessName: businessName.trim() || undefined,
      selectedExpenseNames: selectedExpense.map((c) => c.name),
      selectedIncomeNames: selectedIncome.map((c) => c.name),
    });
    const seededFromOwner = !error && data?.ok && (data.insertedExpenseCategories ?? 0) > 0;

    // 2) Fallback: insert the locally-selected categories directly (idempotent).
    if (!seededFromOwner && selectedExpense.length > 0) {
      const { data: existing } = await userSupabase
        .from("personal_expense_categories")
        .select("name")
        .eq("user_id", user.id);
      const have = new Set(((existing ?? []) as Array<{ name: string }>)
        .map((r) => r.name.trim().toLowerCase()));
      const rows = selectedExpense
        .filter((c) => !have.has(c.name.trim().toLowerCase()))
        .map((c) => ({ user_id: user.id, name: c.name, icon: c.icon, color: c.color }));
      if (rows.length > 0) {
        const { error: insErr } = await userSupabase
          .from("personal_expense_categories")
          .insert(rows);
        if (insErr) {
          setSubmitting(false);
          toast.error("Não foi possível salvar as categorias. Tente novamente.");
          return;
        }
      }
      // Also save display name on profile
      await userSupabase
        .from("profiles")
        .update({ display_name: displayName.trim(), full_name: displayName.trim() })
        .eq("user_id", user.id);
    }

    setSubmitting(false);
    // Mark onboarded locally so guard does not bounce back
    try { localStorage.setItem(`emprestai-onboarded-${user.id}`, "1"); } catch { /* noop */ }
    toast.success("Tudo pronto! Bem-vindo ao " + brandName + " 🎉");
    // Full reload so the onboarding hook re-evaluates and ProtectedRoute lets us in.
    window.location.replace("/");
  };

  const progress = (step / STEPS) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao {brandName}</h1>
          <p className="text-muted-foreground text-sm">
            Vamos configurar sua conta em 3 passos rápidos.
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right">
            Passo {step} de {STEPS}
          </p>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Como podemos te chamar? *</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                className="h-12 rounded-xl"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Nome do seu negócio (opcional)</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ex: Empréstimos do João"
                className="h-12 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Aparece em relatórios e contratos. Você pode editar depois.
              </p>
            </div>
            <Button
              className="w-full h-12 rounded-xl text-base font-semibold"
              onClick={() => setStep(2)}
              disabled={!displayName.trim()}
            >
              Continuar <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                Vamos criar essas categorias para você começar.
                Desmarque as que não quiser.
              </div>
            </div>

            {loadingPreview && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {!loadingPreview && preview && (
              <div className="space-y-5 max-h-[45vh] overflow-y-auto pr-1">
                {preview.expense.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Categorias de despesa ({selectedExpense.length}/{preview.expense.length})
                    </h3>
                    <div className="space-y-1">
                      {preview.expense.map((c) => {
                        const Icon = resolvePersonalIcon(c.icon);
                        const checked = !excludedExp.has(c.name);
                        return (
                          <label
                            key={`e-${c.name}`}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleExp(c.name)} />
                            <span
                              className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: `hsl(${c.color} / 0.15)` }}
                            >
                              <Icon className="h-4 w-4" style={{ color: `hsl(${c.color})` }} />
                            </span>
                            <span className="text-sm text-foreground">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                {preview.income.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Categorias de receita ({selectedIncome.length}/{preview.income.length})
                    </h3>
                    <div className="space-y-1">
                      {preview.income.map((c) => {
                        const Icon = resolvePersonalIcon(c.icon);
                        const checked = !excludedInc.has(c.name);
                        return (
                          <label
                            key={`i-${c.name}`}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleInc(c.name)} />
                            <span
                              className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: `hsl(${c.color} / 0.15)` }}
                            >
                              <Icon className="h-4 w-4" style={{ color: `hsl(${c.color})` }} />
                            </span>
                            <span className="text-sm text-foreground">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                {preview.expense.length === 0 && preview.income.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma categoria padrão disponível ainda — você criará as suas pelo app.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-semibold"
                onClick={() => setStep(3)}
                disabled={loadingPreview}
              >
                Continuar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Tudo certo, {displayName.split(" ")[0]}!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vamos criar sua conta com{" "}
                    <strong>{selectedExpense.length}</strong> categorias de despesa
                    {selectedIncome.length > 0 && (
                      <> e <strong>{selectedIncome.length}</strong> de receita</>
                    )}.
                  </p>
                </div>
              </div>
              {businessName && (
                <div className="text-xs text-muted-foreground border-t border-border pt-3">
                  Negócio: <span className="text-foreground font-medium">{businessName}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setStep(2)}
                disabled={submitting}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-semibold"
                onClick={handleFinish}
                disabled={submitting}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Configurando…</>
                ) : (
                  <>Concluir <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
