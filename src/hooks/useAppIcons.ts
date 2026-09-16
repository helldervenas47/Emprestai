import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  FolderOpen,
  ShoppingBag,
  Car,
  CalendarDays,
  UserPlus,
  Receipt,
  Barcode,
  Wallet,
  Calculator,
  Send,
  MessageCircle,
  Target,
  GraduationCap,
  Settings as SettingsIcon,
  Sliders,
  // Modern / Fintech alternatives
  LayoutDashboard,
  HandCoins,
  Store,
  CarFront,
  Calendar,
  Users,
  ArrowLeftRight,
  QrCode,
  PiggyBank,
  Percent,
  Bot,
  MessagesSquare,
  Crosshair,
  BookOpen,
  SlidersHorizontal,
  Cpu,
  // Commercial / Direct alternatives
  TrendingUp,
  Coins,
  PackageCheck,
  Truck,
  CalendarRange,
  UserCheck,
  CreditCard,
  FileText,
  Banknote,
  Landmark,
  Share2,
  Headset,
  Compass,
  HelpCircle,
  Wrench,
  ShieldCheck,
  // Minimalist / Line alternatives
  Gauge,
  BadgeDollarSign,
  Package,
  Key,
  Clock,
  Contact,
  FileSpreadsheet,
  ReceiptText,
  Briefcase,
  Scale,
  Paperclip,
  BellRing,
  Milestone,
  Award,
  Cog,
  Server,
  // Additional versatile icons
  DollarSign,
  LineChart,
  PieChart,
  Activity,
  Layers,
  Sparkles,
  Inbox,
  FolderLock,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";

export type AppTabId =
  | "overview"
  | "dashboard"
  | "products"
  | "vehicles"
  | "calendar"
  | "clients"
  | "expenses"
  | "boletos"
  | "salary"
  | "accountant"
  | "telegram_reports"
  | "billing_center"
  | "metas"
  | "video_lessons"
  | "settings"
  | "system";

export interface TabInfo {
  id: AppTabId;
  label: string;
  category: "Principal" | "Financeiro" | "Gestão" | "Sistema";
}

export const APP_TAB_INFO: TabInfo[] = [
  { id: "overview", label: "Dashboard", category: "Principal" },
  { id: "dashboard", label: "Empréstimos", category: "Principal" },
  { id: "products", label: "Vendas", category: "Financeiro" },
  { id: "vehicles", label: "Veículos", category: "Financeiro" },
  { id: "calendar", label: "Calendário", category: "Principal" },
  { id: "clients", label: "Cadastro", category: "Gestão" },
  { id: "expenses", label: "Financeiro", category: "Financeiro" },
  { id: "boletos", label: "Boletos", category: "Financeiro" },
  { id: "salary", label: "Salário", category: "Financeiro" },
  { id: "accountant", label: "Contador", category: "Gestão" },
  { id: "telegram_reports", label: "EmprestAI Telegram", category: "Gestão" },
  { id: "billing_center", label: "Central de Cobranças", category: "Gestão" },
  { id: "metas", label: "Metas", category: "Principal" },
  { id: "video_lessons", label: "Vídeo Aulas", category: "Sistema" },
  { id: "settings", label: "Configurações", category: "Sistema" },
  { id: "system", label: "Sistema", category: "Sistema" },
];

/** Mapa padrão de ícones do sistema */
export const DEFAULT_TAB_ICONS: Record<AppTabId, string> = {
  overview: "BarChart3",
  dashboard: "FolderOpen",
  products: "ShoppingBag",
  vehicles: "Car",
  calendar: "CalendarDays",
  clients: "UserPlus",
  expenses: "Receipt",
  boletos: "Barcode",
  salary: "Wallet",
  accountant: "Calculator",
  telegram_reports: "Send",
  billing_center: "MessageCircle",
  metas: "Target",
  video_lessons: "GraduationCap",
  settings: "Settings",
  system: "Sliders",
};

/** Catálogo de todos os ícones suportados para escolha */
export interface IconCatalogItem {
  name: string;
  label: string;
  category: "Financeiro" | "Negócios" | "Gestão & Pessoas" | "Comunicação & IA" | "Sistema & Utilitários";
  icon: LucideIcon;
}

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // Padrão
  BarChart3,
  FolderOpen,
  ShoppingBag,
  Car,
  CalendarDays,
  UserPlus,
  Receipt,
  Barcode,
  Wallet,
  Calculator,
  Send,
  MessageCircle,
  Target,
  GraduationCap,
  Settings: SettingsIcon,
  Sliders,
  // Modern / Fintech
  LayoutDashboard,
  HandCoins,
  Store,
  CarFront,
  Calendar,
  Users,
  ArrowLeftRight,
  QrCode,
  PiggyBank,
  Percent,
  Bot,
  MessagesSquare,
  Crosshair,
  BookOpen,
  SlidersHorizontal,
  Cpu,
  // Comercial / Negócios
  TrendingUp,
  Coins,
  PackageCheck,
  Truck,
  CalendarRange,
  UserCheck,
  CreditCard,
  FileText,
  Banknote,
  Landmark,
  Share2,
  Headset,
  Compass,
  HelpCircle,
  Wrench,
  ShieldCheck,
  // Minimalista / Line
  Gauge,
  BadgeDollarSign,
  Package,
  Key,
  Clock,
  Contact,
  FileSpreadsheet,
  ReceiptText,
  Briefcase,
  Scale,
  Paperclip,
  BellRing,
  Milestone,
  Award,
  Cog,
  Server,
  // Outros
  DollarSign,
  LineChart,
  PieChart,
  Activity,
  Layers,
  Sparkles,
  Inbox,
  FolderLock,
  Boxes,
};

export const ICON_CATALOG: IconCatalogItem[] = [
  // Financeiro
  { name: "HandCoins", label: "Mão com Moedas", category: "Financeiro", icon: HandCoins },
  { name: "Coins", label: "Moedas", category: "Financeiro", icon: Coins },
  { name: "BadgeDollarSign", label: "Emblema Cifrão", category: "Financeiro", icon: BadgeDollarSign },
  { name: "Banknote", label: "Cédula", category: "Financeiro", icon: Banknote },
  { name: "DollarSign", label: "Cifrão", category: "Financeiro", icon: DollarSign },
  { name: "Wallet", label: "Carteira", category: "Financeiro", icon: Wallet },
  { name: "PiggyBank", label: "Cofrinho", category: "Financeiro", icon: PiggyBank },
  { name: "CreditCard", label: "Cartão de Crédito", category: "Financeiro", icon: CreditCard },
  { name: "Receipt", label: "Recibo", category: "Financeiro", icon: Receipt },
  { name: "ReceiptText", label: "Comprovante", category: "Financeiro", icon: ReceiptText },
  { name: "Barcode", label: "Código de Barras", category: "Financeiro", icon: Barcode },
  { name: "QrCode", label: "QR Code", category: "Financeiro", icon: QrCode },
  { name: "Percent", label: "Porcentagem / Juros", category: "Financeiro", icon: Percent },
  { name: "Landmark", label: "Banco / Instituição", category: "Financeiro", icon: Landmark },
  { name: "Scale", label: "Balança / Contabilidade", category: "Financeiro", icon: Scale },
  { name: "Calculator", label: "Calculadora", category: "Financeiro", icon: Calculator },
  { name: "ArrowLeftRight", label: "Transferência / Fluxo", category: "Financeiro", icon: ArrowLeftRight },

  // Negócios & Vendas
  { name: "ShoppingBag", label: "Sacola de Compras", category: "Negócios", icon: ShoppingBag },
  { name: "Store", label: "Loja / Estabelecimento", category: "Negócios", icon: Store },
  { name: "PackageCheck", label: "Pacote Entregue", category: "Negócios", icon: PackageCheck },
  { name: "Package", label: "Pacote / Estoque", category: "Negócios", icon: Package },
  { name: "Boxes", label: "Caixas / Produtos", category: "Negócios", icon: Boxes },
  { name: "Car", label: "Carro", category: "Negócios", icon: Car },
  { name: "CarFront", label: "Veículo Frontal", category: "Negócios", icon: CarFront },
  { name: "Truck", label: "Caminhão / Transporte", category: "Negócios", icon: Truck },
  { name: "Briefcase", label: "Maleta de Negócios", category: "Negócios", icon: Briefcase },
  { name: "TrendingUp", label: "Crescimento / Lucro", category: "Negócios", icon: TrendingUp },
  { name: "Target", label: "Alvo / Metas", category: "Negócios", icon: Target },
  { name: "Crosshair", label: "Foco / Objetivos", category: "Negócios", icon: Crosshair },
  { name: "Award", label: "Premiação / Destaque", category: "Negócios", icon: Award },
  { name: "Milestone", label: "Marco / Etapa", category: "Negócios", icon: Milestone },

  // Gestão & Pessoas
  { name: "Users", label: "Grupo de Usuários", category: "Gestão & Pessoas", icon: Users },
  { name: "UserPlus", label: "Adicionar Cliente", category: "Gestão & Pessoas", icon: UserPlus },
  { name: "UserCheck", label: "Cliente Verificado", category: "Gestão & Pessoas", icon: UserCheck },
  { name: "Contact", label: "Contato", category: "Gestão & Pessoas", icon: Contact },
  { name: "FolderOpen", label: "Pasta Aberta", category: "Gestão & Pessoas", icon: FolderOpen },
  { name: "FolderLock", label: "Pasta Segura", category: "Gestão & Pessoas", icon: FolderLock },
  { name: "FileSpreadsheet", label: "Planilha de Gestão", category: "Gestão & Pessoas", icon: FileSpreadsheet },
  { name: "FileText", label: "Documento / Contrato", category: "Gestão & Pessoas", icon: FileText },
  { name: "CalendarDays", label: "Calendário com Dias", category: "Gestão & Pessoas", icon: CalendarDays },
  { name: "Calendar", label: "Agenda / Calendário", category: "Gestão & Pessoas", icon: Calendar },
  { name: "CalendarRange", label: "Período / Cronograma", category: "Gestão & Pessoas", icon: CalendarRange },
  { name: "Clock", label: "Horário / Prazos", category: "Gestão & Pessoas", icon: Clock },

  // Comunicação & IA
  { name: "Send", label: "Enviar / Telegram", category: "Comunicação & IA", icon: Send },
  { name: "MessageCircle", label: "Mensagem / WhatsApp", category: "Comunicação & IA", icon: MessageCircle },
  { name: "MessagesSquare", label: "Chat / Central", category: "Comunicação & IA", icon: MessagesSquare },
  { name: "Bot", label: "Robô / Assistente IA", category: "Comunicação & IA", icon: Bot },
  { name: "Sparkles", label: "Inteligência / Mágico", category: "Comunicação & IA", icon: Sparkles },
  { name: "Headset", label: "Atendimento / Suporte", category: "Comunicação & IA", icon: Headset },
  { name: "Share2", label: "Compartilhar", category: "Comunicação & IA", icon: Share2 },
  { name: "BellRing", label: "Notificação / Alerta", category: "Comunicação & IA", icon: BellRing },

  // Sistema & Utilitários
  { name: "BarChart3", label: "Gráficos de Barras", category: "Sistema & Utilitários", icon: BarChart3 },
  { name: "LayoutDashboard", label: "Painel Dashboard", category: "Sistema & Utilitários", icon: LayoutDashboard },
  { name: "Gauge", label: "Medidor / Indicadores", category: "Sistema & Utilitários", icon: Gauge },
  { name: "LineChart", label: "Gráfico de Linhas", category: "Sistema & Utilitários", icon: LineChart },
  { name: "PieChart", label: "Gráfico de Pizza", category: "Sistema & Utilitários", icon: PieChart },
  { name: "Activity", label: "Monitoramento / Atividade", category: "Sistema & Utilitários", icon: Activity },
  { name: "GraduationCap", label: "Capelo / Treinamento", category: "Sistema & Utilitários", icon: GraduationCap },
  { name: "BookOpen", label: "Livro Aberto / Aulas", category: "Sistema & Utilitários", icon: BookOpen },
  { name: "Settings", label: "Engrenagem", category: "Sistema & Utilitários", icon: SettingsIcon },
  { name: "Sliders", label: "Controles Deslizantes", category: "Sistema & Utilitários", icon: Sliders },
  { name: "SlidersHorizontal", label: "Filtros / Ajustes", category: "Sistema & Utilitários", icon: SlidersHorizontal },
  { name: "Cog", label: "Mecanismo", category: "Sistema & Utilitários", icon: Cog },
  { name: "Cpu", label: "Processador / Núcleo", category: "Sistema & Utilitários", icon: Cpu },
  { name: "ShieldCheck", label: "Segurança / Proteção", category: "Sistema & Utilitários", icon: ShieldCheck },
  { name: "Key", label: "Chave de Acesso", category: "Sistema & Utilitários", icon: Key },
  { name: "Server", label: "Servidor / Banco", category: "Sistema & Utilitários", icon: Server },
  { name: "Layers", label: "Camadas do Sistema", category: "Sistema & Utilitários", icon: Layers },
];

/** Presets prontos de ícones */
export interface IconPreset {
  id: "padrao" | "moderno" | "comercial" | "minimalista";
  name: string;
  description: string;
  previewIcons: string[];
  mapping: Record<AppTabId, string>;
}

export const ICON_PRESETS: IconPreset[] = [
  {
    id: "padrao",
    name: "Padrão HV Cred",
    description: "Conjunto clássico e equilibrado original do sistema.",
    previewIcons: ["BarChart3", "FolderOpen", "Receipt", "UserPlus", "ShoppingBag"],
    mapping: DEFAULT_TAB_ICONS,
  },
  {
    id: "moderno",
    name: "Moderno / Fintech",
    description: "Visual clean e moderno inspirado nas melhores fintechs.",
    previewIcons: ["LayoutDashboard", "HandCoins", "ArrowLeftRight", "Users", "Store"],
    mapping: {
      overview: "LayoutDashboard",
      dashboard: "HandCoins",
      products: "Store",
      vehicles: "CarFront",
      calendar: "Calendar",
      clients: "Users",
      expenses: "ArrowLeftRight",
      boletos: "QrCode",
      salary: "PiggyBank",
      accountant: "Percent",
      telegram_reports: "Bot",
      billing_center: "MessagesSquare",
      metas: "Crosshair",
      video_lessons: "BookOpen",
      settings: "SlidersHorizontal",
      system: "Cpu",
    },
  },
  {
    id: "comercial",
    name: "Comercial / Direto",
    description: "Ícones expressivos focados em vendas, operações e fluxo de caixa.",
    previewIcons: ["TrendingUp", "Coins", "CreditCard", "UserCheck", "PackageCheck"],
    mapping: {
      overview: "TrendingUp",
      dashboard: "Coins",
      products: "PackageCheck",
      vehicles: "Truck",
      calendar: "CalendarRange",
      clients: "UserCheck",
      expenses: "CreditCard",
      boletos: "FileText",
      salary: "Banknote",
      accountant: "Landmark",
      telegram_reports: "Share2",
      billing_center: "Headset",
      metas: "Target",
      video_lessons: "GraduationCap",
      settings: "Wrench",
      system: "ShieldCheck",
    },
  },
  {
    id: "minimalista",
    name: "Minimalista / Line",
    description: "Traço refinado e discreto para máxima clareza e elegância.",
    previewIcons: ["Gauge", "BadgeDollarSign", "FileSpreadsheet", "Contact", "Package"],
    mapping: {
      overview: "Gauge",
      dashboard: "BadgeDollarSign",
      products: "Package",
      vehicles: "Car",
      calendar: "Clock",
      clients: "Contact",
      expenses: "FileSpreadsheet",
      boletos: "ReceiptText",
      salary: "Wallet",
      accountant: "Scale",
      telegram_reports: "Send",
      billing_center: "BellRing",
      metas: "Milestone",
      video_lessons: "Award",
      settings: "Cog",
      system: "Server",
    },
  },
];

const STORAGE_KEY = "hvcred-app-custom-icons";
const EVENT_KEY = "hvcred-app-icons-updated";

function safeGetCustomIcons(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeSetCustomIcons(icons: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: icons }));
  } catch (err) {
    void err;
  }
}

export function getResolvedTabIconComponent(tabId: AppTabId, iconNameOverride?: string): LucideIcon {
  const iconName = iconNameOverride || DEFAULT_TAB_ICONS[tabId] || "FolderOpen";
  return ICON_REGISTRY[iconName] || BarChart3;
}

export function useAppIcons() {
  const [customIcons, setCustomIcons] = useState<Record<string, string>>(() => safeGetCustomIcons());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setCustomIcons(detail);
      } else {
        setCustomIcons(safeGetCustomIcons());
      }
    };

    window.addEventListener(EVENT_KEY, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Hidratação opcional silenciosa da nuvem
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess?.user?.id;
        if (!uid) return;
        const { data, error } = await (supabase.from("profiles") as any)
          .select("ui_icons")
          .eq("user_id", uid)
          .maybeSingle();
        if (!alive || error || !data?.ui_icons) return;
        if (typeof data.ui_icons === "object") {
          setCustomIcons((prev) => {
            const merged = { ...prev, ...data.ui_icons };
            safeSetCustomIcons(merged);
            return merged;
          });
        }
      } catch {
        /* Silencioso se a coluna não existir */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const getTabIconName = useCallback(
    (tabId: AppTabId): string => {
      return customIcons[tabId] || DEFAULT_TAB_ICONS[tabId] || "FolderOpen";
    },
    [customIcons]
  );

  const getTabIcon = useCallback(
    (tabId: AppTabId): LucideIcon => {
      const name = getTabIconName(tabId);
      return ICON_REGISTRY[name] || BarChart3;
    },
    [getTabIconName]
  );

  const setIconForTab = useCallback(
    async (tabId: AppTabId, iconName: string) => {
      const next = { ...customIcons, [tabId]: iconName };
      setCustomIcons(next);
      safeSetCustomIcons(next);

      try {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess?.user?.id;
        if (!uid) return;
        await (supabase.from("profiles") as any)
          .update({ ui_icons: next })
          .eq("user_id", uid);
      } catch {
        /* Silencioso */
      }
    },
    [customIcons]
  );

  const applyPreset = useCallback(
    async (presetId: IconPreset["id"]) => {
      const preset = ICON_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const next = { ...preset.mapping };
      setCustomIcons(next);
      safeSetCustomIcons(next);

      try {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess?.user?.id;
        if (!uid) return;
        await (supabase.from("profiles") as any)
          .update({ ui_icons: next })
          .eq("user_id", uid);
      } catch {
        /* Silencioso */
      }
    },
    []
  );

  const resetToDefaults = useCallback(async () => {
    setCustomIcons({});
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: {} }));
      } catch (err) {
        void err;
      }
    }

    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess?.user?.id;
      if (!uid) return;
      await (supabase.from("profiles") as any)
        .update({ ui_icons: null })
        .eq("user_id", uid);
    } catch {
      /* Silencioso */
    }
  }, []);

  const activePresetId = React.useMemo<IconPreset["id"] | "custom">(() => {
    for (const preset of ICON_PRESETS) {
      const matches = Object.entries(preset.mapping).every(
        ([tabId, iconName]) => (customIcons[tabId] || DEFAULT_TAB_ICONS[tabId as AppTabId]) === iconName
      );
      if (matches) return preset.id;
    }
    return "custom";
  }, [customIcons]);

  return {
    customIcons,
    getTabIconName,
    getTabIcon,
    setIconForTab,
    applyPreset,
    resetToDefaults,
    activePresetId,
    presets: ICON_PRESETS,
    catalog: ICON_CATALOG,
    tabs: APP_TAB_INFO,
  };
}
