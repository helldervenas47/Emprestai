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
  Type,
  Layers,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";
import { AppFontSelector } from "@/components/AppFontSelector";
import { AppIconsSettingsCard } from "@/components/AppIconsSettingsCard";

const UserManagement = lazy(() => import("@/features/admin/components/UserManagement").then(m => ({ default: m.UserManagement })));
const BrandingSettings = lazy(() => import("@/components/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const InviteAndApprovalSettings = lazy(() => import("@/features/admin/components/InviteAndApprovalSettings").then(m => ({ default: m.InviteAndApprovalSettings })));
const SystemHealth = lazy(() => import("@/features/admin/components/SystemHealth").then(m => ({ default: m.SystemHealth })));
const ApiKeysManager = lazy(() => import("@/components/ApiKeysManager").then(m => ({ default: m.ApiKeysManager })));
const RolePermissionsMatrix = lazy(() => import("@/features/admin/components/admin/RolePermissionsMatrix").then(m => ({ default: m.RolePermissionsMatrix })));
const PlanManagement = lazy(() => import("@/features/admin/components/admin/PlanManagement").then(m => ({ default: m.PlanManagement })));
const SubscriptionManagement = lazy(() => import("@/features/admin/components/admin/SubscriptionManagement").then(m => ({ default: m.SubscriptionManagement })));

const SectionLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

interface CollapsibleSettingsCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function CollapsibleSettingsCard({
  icon: Icon,
  title,
  description,
  open,
  onOpenChange,
  children,
}: CollapsibleSettingsCardProps) {
  return (
    <Card className="w-full">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-xl"
          >
            <CardHeader className="flex-row items-center justify-between space-y-0 p-4 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl">
              <div className="space-y-1 pr-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Icon className="h-4 w-4 text-primary shrink-0" /> {title}
                </CardTitle>
                {typeof description === "string" ? (
                  <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
                ) : (
                  description
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline font-medium">
                  {open ? "Recolher" : "Expandir"}
                </span>
                <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center border border-border/50">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-300",
                      open && "rotate-180"
                    )}
                  />
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 sm:pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function SystemSettings() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const isAdmin = role === "admin";
  const [subTab, setSubTab] = useState<string>(isAdmin ? "admin" : "billing");

  // Admin tab collapsibles
  const [usersExpanded, setUsersExpanded] = useState(false);

  // Billing (Conta) tab collapsibles — todos recolhidos por padrão
  const [planExpanded, setPlanExpanded] = useState(false);
  const [brandingExpanded, setBrandingExpanded] = useState(false);
  const [fontExpanded, setFontExpanded] = useState(false);
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [apiKeysExpanded, setApiKeysExpanded] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);

  const planLabel = isActive && subscription
    ? subscription.product_id === "basico_plan" ? "Básico"
    : subscription.product_id === "profissional_plan" ? "Profissional"
    : subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano ativo"
    : "Sem plano";

  const systemTabs = [
    { value: "admin", label: "Administração", icon: ShieldCheck, adminOnly: true },
    { value: "plans", label: "Planos", icon: Package, adminOnly: true },
    { value: "subscriptions", label: "Assinaturas", icon: BadgeCheck, adminOnly: true },
    { value: "billing", label: "Conta", icon: Wallet, adminOnly: false },
  ].filter(tab => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-6 w-full">

      <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
        {/* Abas Responsivas: Grade 2 colunas no mobile, Flex no desktop */}
        <TabsList className="w-full grid grid-cols-2 sm:flex sm:flex-wrap h-auto gap-1.5 sm:gap-1 bg-muted/40 sm:bg-muted/50 p-1.5 sm:p-1 rounded-2xl sm:rounded-lg border border-border/40 sm:border-transparent">
          {systemTabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center justify-center sm:justify-start gap-2 sm:gap-1.5 h-10 sm:h-9 text-xs sm:text-xs font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all flex-1 min-w-0 sm:min-w-[120px]"
              >
                <TabIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </TabsTrigger>
            );
          })}
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
          {/* Plano e Assinatura */}
          <CollapsibleSettingsCard
            icon={CreditCard}
            title="Plano e assinatura"
            description={
              <CardDescription>
                Plano atual: <span className="font-semibold text-foreground">{planLabel}</span>
              </CardDescription>
            }
            open={planExpanded}
            onOpenChange={setPlanExpanded}
          >
            <div className="pt-2">
              <Button onClick={() => navigate("/planos")} variant="outline" size="sm">
                Gerenciar plano
              </Button>
            </div>
          </CollapsibleSettingsCard>

          {/* Identidade Visual & Ícones */}
          {isAdmin && (
            <CollapsibleSettingsCard
              icon={ImageIcon}
              title="Identidade visual, Logo da Marca & Ícone PWA"
              description="Defina o ícone oficial do aplicativo (PWA na tela inicial do celular), favicon da aba do navegador, logo do cabeçalho e relatórios em PDF."
              open={brandingExpanded}
              onOpenChange={setBrandingExpanded}
            >
              <Suspense fallback={<SectionLoader />}>
                {brandingExpanded && <BrandingSettings />}
              </Suspense>
            </CollapsibleSettingsCard>
          )}

          {/* Fonte do Aplicativo */}
          <CollapsibleSettingsCard
            icon={Type}
            title="Fonte do aplicativo"
            description="Escolha a tipografia usada em toda a interface. A mudança é aplicada instantaneamente e sincronizada em todos os seus dispositivos."
            open={fontExpanded}
            onOpenChange={setFontExpanded}
          >
            <AppFontSelector embedded />
          </CollapsibleSettingsCard>

          {/* Ícones do Aplicativo */}
          <CollapsibleSettingsCard
            icon={Layers}
            title="Ícones do aplicativo"
            description="Personalize os ícones de navegação e módulos do sistema. Escolha um pacote pronto com um clique ou defina ícones personalizados para cada aba."
            open={iconsExpanded}
            onOpenChange={setIconsExpanded}
          >
            <AppIconsSettingsCard embedded />
          </CollapsibleSettingsCard>

          {/* Aparência e Tema */}
          <CollapsibleSettingsCard
            icon={Palette}
            title="Personalização visual e Tema"
            description="Escolha um tema para o aplicativo. Pré-visualização instantânea, alternância sem reiniciar e salvamento automático das suas preferências."
            open={themeExpanded}
            onOpenChange={setThemeExpanded}
          >
            <ThemeSettingsCard embedded />
          </CollapsibleSettingsCard>

          {/* Chaves APIs */}
          {isAdmin && (
            <CollapsibleSettingsCard
              icon={KeyRound}
              title="Chaves APIs"
              description="Liste, edite, ative/desative e remova as chaves de API utilizadas pelas integrações do aplicativo."
              open={apiKeysExpanded}
              onOpenChange={setApiKeysExpanded}
            >
              <Suspense fallback={<SectionLoader />}>
                {apiKeysExpanded && <ApiKeysManager />}
              </Suspense>
            </CollapsibleSettingsCard>
          )}

          {/* Saúde do Sistema */}
          {isAdmin && (
            <CollapsibleSettingsCard
              icon={Activity}
              title="Saúde do sistema"
              description="Painel administrativo com indicadores em tempo real: latência do banco, sessões ativas, contagens e status online."
              open={healthExpanded}
              onOpenChange={setHealthExpanded}
            >
              <Suspense fallback={<SectionLoader />}>
                {healthExpanded && <SystemHealth />}
              </Suspense>
            </CollapsibleSettingsCard>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
