import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User as UserIcon,
  LogOut,
  Sun,
  Moon,
  Settings as SettingsIcon,
  CreditCard,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { PlanExpirationInfo } from "@/components/PlanExpirationInfo";

export type SidebarTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type SidebarGroup = {
  label: string;
  ids: string[];
};

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  { label: "Principal", ids: ["overview", "calendar", "metas"] },
  {
    label: "Financeiro",
    ids: ["expenses", "dashboard", "products", "vehicles", "boletos", "salary"],
  },
  { label: "Gestão", ids: ["clients", "accountant", "overdue"] },
  { label: "Sistema", ids: ["help", "settings", "system"] },
];

const STORAGE_KEY = "hvcred-sidebar-collapsed";
const SIDEBAR_EXPANDED_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_WIDTH_CSS_VAR = "--app-sidebar-width";

export function getInitialAppSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_EXPANDED_WIDTH;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    return saved === "1" ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  }
  return window.innerWidth < 1280 ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
}

function getSidebarWidth(collapsed: boolean) {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
}

function useSidebarCollapsed() {
  const isSmall = useIsMobileOrTablet();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === "1";
    // default: tablets collapsed, desktop expanded
    return window.innerWidth < 1280;
  });
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.style.setProperty(
      SIDEBAR_WIDTH_CSS_VAR,
      `${getSidebarWidth(collapsed)}px`
    );
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  // On initial mount, force collapse for tablets if user has no saved preference.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null && isSmall) setCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSmall]);
  return { collapsed, setCollapsed };
}

export function useAppSidebarWidth() {
  return getInitialAppSidebarWidth();
}

interface AppSidebarProps {
  brandName: string;
  tabs: SidebarTabItem[]; // already permission-filtered
  activeTab: string;
  onSelect: (id: string) => void;
  user: { display_name?: string | null; email?: string | null } | null;
  role: string | null;
  planLabel: string;
  onSignOut: () => void;
  onToggleTheme: () => void;
  darkMode: boolean;
  hasActiveSub?: boolean;
  onOpenPlans?: () => void;
  popoverExtras?: React.ReactNode;
}

export function AppSidebar({
  brandName,
  tabs,
  activeTab,
  onSelect,
  user,
  role,
  planLabel,
  onSignOut,
  onToggleTheme,
  darkMode,
  hasActiveSub,
  onOpenPlans,
  popoverExtras,
}: AppSidebarProps) {


  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const navigate = useNavigate();

  const tabsById = useMemo(() => {
    const m = new Map<string, SidebarTabItem>();
    tabs.forEach((t) => m.set(t.id, t));
    return m;
  }, [tabs]);

  const groups = useMemo(
    () =>
      SIDEBAR_GROUPS.map((g) => ({
        label: g.label,
        items: g.ids
          .map((id) => tabsById.get(id))
          .filter((t): t is SidebarTabItem => !!t),
      })).filter((g) => g.items.length > 0),
    [tabsById]
  );

  const displayName =
    user?.display_name || user?.email || "Usuário";
  const initials = (displayName || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const width = getSidebarWidth(collapsed);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Navegação principal"
        style={{ width }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden md:flex flex-col",
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          "will-change-[width] transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 h-14 border-b border-sidebar-border shrink-0",
            collapsed && "justify-center px-2"
          )}
        >
          <div className="shrink-0">
            <AppLogo area="header" alt={brandName} className="w-auto h-8" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{brandName}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                CONTROLE DE EMPRÉSTIMOS
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", collapsed && "hidden")}
            onClick={() => setCollapsed(true)}
            aria-label="Recolher menu"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {collapsed && (
          <div className="flex justify-center py-1 border-b border-sidebar-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir menu"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              {!collapsed ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </p>
              ) : (
                <div className="mx-3 mb-1 border-t border-sidebar-border/60" />
              )}
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  const button = (
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative group flex items-center w-full rounded-lg text-sm font-medium transition-[color,background-color,transform,opacity] duration-150 ease-out",
                        collapsed
                          ? "justify-center h-10 w-10 mx-auto"
                          : "gap-3 px-3 h-10",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {active && !collapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-primary-foreground/70" />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-primary-foreground" : ""
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate font-bold">{item.label}</span>
                      )}
                    </button>
                  );
                  return (
                    <li key={item.id}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        button
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-2 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center w-full rounded-lg p-2 hover:bg-sidebar-accent transition-colors",
                  collapsed ? "justify-center" : "gap-2"
                )}
                aria-label="Menu do usuário"
              >
                <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials}
                </div>
                {!collapsed && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-xs font-semibold truncate">
                        {displayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {planLabel}
                      </p>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side={collapsed ? "right" : "top"}
              align="start"
              className="w-[285px] p-1"
            >
              <div className="px-2.5 py-2 border-b border-border/70 mb-1 space-y-1.5">
                <p className="text-xs font-semibold truncate">{displayName}</p>
                {user?.email && (
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {role && (
                    <Badge
                      variant={role === "admin" ? "default" : role === "visualizador" ? "outline" : "secondary"}
                      className="text-[9px] px-1.5 py-0 capitalize"
                    >
                      {role === "admin" ? "Admin" : role === "gerente" ? "Gerente" : role === "cliente" ? "Cliente" : role === "visualizador" ? "Vis." : role}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 border-primary/40 text-primary uppercase font-semibold"
                    onClick={() => (onOpenPlans ? onOpenPlans() : navigate("/planos"))}
                  >
                    {hasActiveSub ? (planLabel.toLowerCase().startsWith("plano") ? planLabel : `PLANO ${planLabel}`) : "Sem Plano"}
                  </Badge>
                </div>
                <div className="pt-1.5 border-t border-border/40">
                  <PlanExpirationInfo className="text-[11px]" />
                </div>
              </div>
              <SidebarMenuAction
                icon={UserIcon}
                label="Meu Perfil"
                onClick={() => onSelect("settings")}
              />
              <SidebarMenuAction
                icon={CreditCard}
                label="Plano"
                onClick={() => (onOpenPlans ? onOpenPlans() : navigate("/planos"))}
              />
              {popoverExtras}
              <SidebarMenuAction
                icon={darkMode ? Sun : Moon}
                label={darkMode ? "Modo claro" : "Modo escuro"}
                onClick={onToggleTheme}
              />
              <SidebarMenuAction
                icon={SettingsIcon}
                label="Configurações"
                onClick={() => onSelect("settings")}
              />


              <div className="my-1 h-px bg-border" />
              <SidebarMenuAction
                icon={LogOut}
                label="Sair"
                onClick={onSignOut}
                destructive
              />
            </PopoverContent>
          </Popover>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export function SidebarMenuAction({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
