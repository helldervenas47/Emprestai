import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CreditCard,
  Users as UsersIcon,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Palette,
  Wallet,
  Activity,
  KeyRound,
  Package,
  BadgeCheck,
  Sparkles,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { toast } from "sonner";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";
import { TelegramImageDeliveryCard } from "@/features/telegram/components/TelegramImageDeliveryCard";
import { AppFontSelector } from "@/components/AppFontSelector";

const UserManagement = lazy(() => import("@/features/admin/components/UserManagement").then(m => ({ default: m.UserManagement })));
const BrandingSettings = lazy(() => import("@/components/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const InviteAndApprovalSettings = lazy(() => import("@/features/admin/components/InviteAndApprovalSettings").then(m => ({ default: m.InviteAndApprovalSettings })));
const SystemHealth = lazy(() => import("@/features/admin/components/SystemHealth").then(m => ({ default: m.SystemHealth })));
const ApiKeysManager = lazy(() => import("@/components/ApiKeysManager").then(m => ({ default: m.ApiKeysManager })));
const RolePermissionsMatrix = lazy(() => import("@/features/admin/components/admin/RolePermissionsMatrix").then(m => ({ default: m.RolePermissionsMatrix })));
const PlanManagement = lazy(() => import("@/features/admin/components/admin/PlanManagement").then(m => ({ default: m.PlanManagement })));
const SubscriptionManagement = lazy(() => import("@/features/admin/components/admin/SubscriptionManagement").then(m => ({ default: m.SubscriptionManagement })));
const SaasFinancialDashboard = lazy(() => import("@/features/admin/components/admin/SaasFinancialDashboard").then(m => ({ default: m.SaasFinancialDashboard })));


const SectionLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

export function SystemSettings() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const { resetOnboarding } = useOnboardingProgress();
  const isAdmin = role === "admin";
  const [subTab, setSubTab] = useState<string>(isAdmin ? "admin" : "billing");
  const [usersExpanded, setUsersExpanded] = useState(false);

  const planLabel = isActive && subscription
    ? subscription.product_id === "basico_plan" ? "Básico"
    : subscription.product_id === "profissional_plan" ? "Profissional"
    : subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano ativo"
    : "Sem plano";

  return (
    <div className="space-y-6 w-full">

      <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {isAdmin && (
            <TabsTrigger value="admin" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <ShieldCheck className="h-3.5 w-3.5" /> Administração
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="financial" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <TrendingUp className="h-3.5 w-3.5" /> Faturamento
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="plans" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <Package className="h-3.5 w-3.5" /> Planos
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="subscriptions" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <BadgeCheck className="h-3.5 w-3.5" /> Assinaturas
            </TabsTrigger>
          )}

          <TabsTrigger value="billing" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
            <Wallet className="h-3.5 w-3.5" /> Conta
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
            <Palette className="h-3.5 w-3.5" /> Personalização
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="api-keys" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <KeyRound className="h-3.5 w-3.5" /> Chaves APIs
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="health" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <Activity className="h-3.5 w-3.5" /> Saúde do Sistema
            </TabsTrigger>
          )}
        </TabsList>

        {isAdmin && (
          <TabsContent value="admin" className="space-y-4 mt-4">
            <Card>
              <Collapsible open={usersExpanded} onOpenChange={setUsersExpanded}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-xl"
                  >
                    <CardHeader className="flex-row items-center justify-between space-y-0 p-4 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <UsersIcon className="h-4 w-4 text-primary" /> Gerenciamento de usuários
                        </CardTitle>
                        <CardDescription>Crie e gerencie usuários, papéis e permissões.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:inline font-medium">
                          {usersExpanded ? "Recolher" : "Expandir"}
                        </span>
                        <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center border border-border/50">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform duration-300",
                              usersExpanded && "rotate-180"
                            )}
                          />
                        </div>
                      </div>
                    </CardHeader>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 sm:pt-0">
                    <Suspense fallback={<SectionLoader />}>
                      {usersExpanded && <UserManagement />}
                    </Suspense>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            <Suspense fallback={<SectionLoader />}>
              <RolePermissionsMatrix />
            </Suspense>

            <Suspense fallback={<SectionLoader />}>
              <InviteAndApprovalSettings />
            </Suspense>

            <TelegramImageDeliveryCard />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="financial" className="space-y-4 mt-4">
            <Suspense fallback={<SectionLoader />}>
              <SaasFinancialDashboard />
            </Suspense>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="plans" className="space-y-4 mt-4">
            <Suspense fallback={<SectionLoader />}>
              <PlanManagement />
            </Suspense>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="subscriptions" className="space-y-4 mt-4">
            <Suspense fallback={<SectionLoader />}>
              <SubscriptionManagement />
            </Suspense>
          </TabsContent>
        )}



        <TabsContent value="billing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" /> Plano e assinatura
              </CardTitle>
              <CardDescription>
                Plano atual: <span className="font-semibold text-foreground">{planLabel}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/planos")} variant="outline" size="sm">
                Gerenciar plano
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Guia de Primeiros Passos
              </CardTitle>
              <CardDescription>
                Deseja rever os passos recomendados de configuração inicial no Dashboard?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await resetOnboarding();
                  toast.success("Guia de primeiros passos reativado no Dashboard!");
                }}
              >
                Mostrar guia inicial novamente
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4 mt-4">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4 text-primary" /> Identidade visual
                </CardTitle>
                <CardDescription>
                  Defina a logo oficial do sistema e personalize o tamanho em pixels para cada área e dispositivo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}>
                  <BrandingSettings />
                </Suspense>
              </CardContent>
            </Card>
          )}

          <AppFontSelector />

          <ThemeSettingsCard />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="api-keys" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4 text-primary" /> Chaves APIs
                </CardTitle>
                <CardDescription>
                  Liste, edite, ative/desative e remova as chaves de API utilizadas pelas integrações do aplicativo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}>
                  <ApiKeysManager />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="health" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" /> Saúde do sistema
                </CardTitle>
                <CardDescription>
                  Painel administrativo com indicadores em tempo real: latência do banco, sessões ativas, contagens e status online.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}>
                  <SystemHealth />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
