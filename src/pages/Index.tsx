/* Leia o arquivo instrucoes.md em anexo e siga as instruções. Analise também os demais arquivos anexados. */
/* Utilize o commit **`4112fd3` como referência funcional** para corrigir a lógica de avanço das **despesas parceladas**, pois nessa versão o comportamento de avanço das parcelas está correto.

O problema atual ocorre após a realização de um pagamento: uma **parcela filha é criada corretamente com status de paga**, porém, ao avançar a **parcela pai para o próximo vencimento**, o sistema está mantendo ou atribuindo indevidamente o status **Pago** à parcela pai.

### Objetivo da correção

Compare a implementação atual com o código existente no commit **`4112fd3`** e identifique como aquela versão realizava o avanço das despesas parceladas sem alterar indevidamente o status da parcela pai.

A implementação atual deve reproduzir o mesmo comportamento funcional do commit de referência, adaptando apenas o necessário à estrutura atual do sistema.

### Comportamento esperado

O fluxo correto deve ser:

**Pagamento da parcela atual → criação da parcela filha com status Pago → atualização do histórico de pagamento → avanço da parcela pai para o próximo vencimento → parcela pai permanece com status Pendente.**

Portanto:

* A **parcela filha** representa exclusivamente o pagamento realizado e deve ficar com status **Pago**.
* A **parcela pai** deve avançar corretamente para a próxima data de vencimento.
* Após avançar, a parcela pai deve assumir o status **Pendente de pagamento**, pois o novo vencimento ainda não foi pago.
* O status **Pago** da parcela filha não pode ser copiado, reutilizado ou propagado para a parcela pai.
* A criação de uma parcela filha não representa o pagamento do próximo vencimento da parcela pai.
* Cada parcela deve manter seu próprio status e ciclo de pagamento.

### Processo obrigatório

1. Analise detalhadamente o commit **`4112fd3`**.
2. Identifique a lógica responsável pelo avanço da parcela pai após o pagamento.
3. Compare essa implementação com a versão atual.
4. Identifique exatamente qual alteração posterior causou a atribuição indevida do status **Pago** à parcela pai.
5. Restaure ou adapte apenas a lógica necessária para reproduzir o comportamento correto do commit `4112fd3`.
6. Não faça rollback completo do projeto.
7. Preserve todas as funcionalidades e correções implementadas após esse commit que não estejam relacionadas ao problema.

### Pontos específicos para auditar

Verifique especialmente:

* A função responsável por criar a parcela filha.
* A atualização do status da parcela filha.
* A função responsável por avançar a data de vencimento da parcela pai.
* O `update` realizado na parcela pai após o pagamento.
* Possíveis reutilizações do mesmo objeto entre parcela pai e filha.
* Possíveis cópias indevidas do campo `status`.
* Atualizações em lote que possam estar marcando ambas as parcelas como pagas.
* Atualizações otimistas ou estados locais que estejam sobrescrevendo o status correto retornado pelo banco.
* A persistência final dos status no banco de dados.

### Exemplo esperado

**Antes do pagamento:**

* Parcela pai: vencimento **10/08/2026** — Status: **Pendente**

**Após o pagamento:**

* Parcela filha: pagamento referente ao vencimento **10/08/2026** — Status: **Pago**
* Parcela pai: próximo vencimento **10/09/2026** — Status: **Pendente**

O sistema não deve, em nenhuma circunstância, avançar a parcela pai para **10/09/2026** e mantê-la com status **Pago**, pois esse novo vencimento ainda não recebeu pagamento.

### Validação final obrigatória

Após implementar a correção:

1. Realize o pagamento de uma despesa parcelada.
2. Confirme que a parcela filha foi criada com status **Pago**.
3. Confirme que a parcela pai avançou para o próximo vencimento.
4. Verifique diretamente no banco de dados que a parcela pai foi persistida com status **Pendente**.
5. Realize novos pagamentos consecutivos e confirme que o comportamento se mantém em todos os ciclos.
6. Teste diferentes despesas parceladas.
7. Confirme que nenhum status de pagamento é propagado indevidamente entre parcela filha e parcela pai.
8. Verifique se os valores, vencimentos, quantidade de parcelas restantes e demais informações continuam sendo atualizados corretamente.

**Importante:** o commit **`4112fd3` deve ser utilizado como modelo de referência para a lógica correta de avanço das despesas parceladas**. O objetivo é recuperar esse comportamento específico na versão atual, sem realizar um rollback completo e sem alterar funcionalidades não relacionadas ao problema. A correção deve garantir que **o pagamento da parcela filha jamais marque automaticamente o próximo vencimento da parcela pai como pago** */
/* Todas as despesas pessoais e empresariais criadas dentro do aplicativo, por meio da aba Financeiro, devem ser efetivamente salvas no banco de dados externo do Supabase, utilizando a tabela expenses como fonte oficial de persistência.

Atualmente, verifique se os registros estão sendo apenas adicionados ao estado local, cache ou interface sem que a operação de gravação seja concluída corretamente no banco de dados.

Fluxo obrigatório de salvamento

Ao criar uma nova despesa na aba Financeiro, o sistema deve seguir o fluxo:

Formulário de despesa → validação dos dados → identificação do escopo → montagem do payload → insert na tabela expenses do Supabase → confirmação de sucesso → atualização da interface.

A interface só deve considerar a despesa como criada após receber a confirmação de que o registro foi persistido com sucesso no Supabase.

Despesas pessoais

Ao cadastrar uma despesa pessoal:

O registro deve ser salvo na tabela expenses.

O escopo deve ser identificado corretamente como personal, ou conforme o valor equivalente utilizado na estrutura atual do banco.

Todos os dados informados no formulário devem ser persistidos corretamente.

Caso a despesa esteja vinculada a um cartão de crédito, o identificador correto do cartão também deve ser salvo.

Após recarregar o aplicativo, a despesa deve continuar sendo carregada diretamente da tabela expenses.

Despesas empresariais

Ao cadastrar uma despesa empresarial:

O registro também deve ser salvo na mesma tabela expenses.

O escopo deve ser identificado corretamente como business, ou conforme a nomenclatura existente no banco.

Os campos específicos da despesa empresarial devem ser persistidos corretamente.

O registro deve permanecer disponível após atualizar, fechar ou reabrir o aplicativo.

Auditoria necessária

Verifique todo o processo responsável pelo salvamento das despesas:

Formulário e captura dos dados.

Validação dos campos obrigatórios.

Payload enviado ao Supabase.

Função, hook ou serviço responsável pela criação da despesa.

Operação de insert na tabela expenses.

Estrutura e nomes dos campos enviados.

Identificação do usuário, empresa ou organização, quando aplicável.

Identificação correta do escopo personal e business.

Políticas RLS e permissões do Supabase.

Constraints, triggers ou regras do banco que possam impedir o salvamento.

Tratamento dos erros retornados pelo Supabase.

Possíveis falhas silenciosas.

Atualizações otimistas ou cache que possam estar simulando um salvamento sem persistência real.

Regras importantes

Não mantenha uma despesa apenas no estado local como se ela estivesse salva.

Não exiba mensagem de sucesso se o insert na tabela expenses falhar.

Em case de erro, capture e apresente a falha corretamente.

Não crie registros duplicados.

Preserve a separação correta entre despesas pessoais e empresariais.

Mantenha compatibilidade com todas as funcionalidades atuais do módulo Financeiro.

Qualquer despesa criada, editada ou excluída deve refletir corretamente as alterações na tabela expenses.

Validação final obrigatória

Após implementar a correção, realize testes reais:

Crie uma nova despesa pessoal pela aba Financeiro.

Confirme diretamente no Supabase que o registro foi inserido na tabela expenses.

Recarregue o aplicativo e confirme que a despesa continua existindo.

Crie uma nova despesa empresarial.

Confirme que ela também foi salva corretamente na tabela expenses.

Recarregue novamente o aplicativo e valide a persistência.

Edite uma despesa e confirme que a alteração é refletida no Supabase.

Exclua uma despesa e valide que a operação também ocorre corretamente no banco, conforme a regra atual do sistema.

Confirme que os registros continuam aparecendo corretamente nas respectivas abas Despesas Pessoais e Despesas Empresariais.

Importante: a tabela expenses do Supabase deve ser a fonte de verdade para todas as despesas criadas pelo aplicativo. A correção deve garantir a persistência real dos dados no banco, e não apenas a exibição temporária dos registros na interface. */
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import {
  Plus,
  Users,
  LayoutDashboard,
  FolderOpen,
  Folders,
  ShoppingBag,
  BarChart3,
  AlertTriangle,
  Receipt,
  CalendarDays,
  Sun,
  Moon,
  LogOut,
  Info,
  X,
  Eye,
  EyeOff,
  Car,
  Wrench,
  DatabaseBackup,
  Menu,
  User,
  RefreshCw,
  Bell,
  Target,
  Calculator,
  Settings as SettingsIcon,
  CalendarClock,
  Pin,
  Check,
  Sliders,
  Loader2,
  GripVertical,
  Activity,
  Send,
  MessageCircle,
  Wallet,
  Barcode,
  UserPlus,
  Sparkles,
  History,
  ChevronRight,
  Crown,
  Trophy,
} from "lucide-react";
import type { Expense } from "@/types/loan";
import { applyScopedExpenseDelete, type DeleteScope } from "@/features/financial/lib/expenseSeriesScope";
import { AppLogo } from "@/components/AppLogo";
import { AppSidebar, getInitialAppSidebarWidth, SidebarMenuAction } from "@/components/AppSidebar";
import { useAppBranding } from "@/hooks/useAppBranding";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useIsMobile, useIsMobileOrTablet } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useMyRoleTabs } from "@/features/admin/hooks/useRoleTabPermissions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HideValuesProvider, useHideValues } from "@/contexts/HideValuesContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useAccessLock } from "@/hooks/useAccessLock";
import { AccessLockScreen } from "@/features/admin/components/upgrade/AccessLockScreen";
import { resolveTabTransition } from "@/lib/tabNavigation";
import { LazyDialogBoundary } from "@/components/LazyDialogBoundary";
import { usePersistentOption } from "@/hooks/usePersistentNavState";
import { NAV_KEYS, setNavigationScope } from "@/lib/navigationState";
import {
  getAppScrollContainer,
  getScrollTop,
  restoreScrollWhenReady,
  setScrollTop,
  useScrollPolicy,
} from "@/lib/scrollPolicy";
import { TabSkeleton } from "@/components/navigation/TabSkeleton";
import { SpeedDialFab, type SpeedDialAction } from "@/components/navigation/SpeedDialFab";

import { revealDeepLinkTarget } from "@/lib/deepLink";
import { onAppUIEvent } from "@/lib/appUIEvents";

// Static imports for tiny, session-critical UI (banners/gates + DashboardCards).
// Bundle-analysis (gzip): SubscriptionBanner 0.5 kB, SubscriptionGate 0.8 kB,
// TrialBanner 0.6 kB, DashboardCards 2.2 kB — negligible for the initial JS.
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { TrialBanner } from "@/features/admin/components/upgrade/TrialBanner";
import { DashboardCards } from "@/features/dashboard/components/DashboardCards";

// Lazy load heavy components
const HelpChat = lazy(() => import("@/components/HelpChat"));
// Shared dynamic-import loaders — reused by React.lazy and by prefetch triggers so
// the module cache dedupes and there is a single source of truth for the path.
const loadLoanForm = () =>
  import("@/features/loans/components/LoanForm").then((m) => ({ default: m.LoanForm }));
const loadClientForm = () =>
  import("@/features/clients/components/ClientForm").then((m) => ({ default: m.ClientForm }));
const loadExpenseForm = () =>
  import("@/features/financial/components/ExpenseForm").then((m) => ({ default: m.ExpenseForm }));
const loadPersonalExpenseForm = () =>
  import("@/features/financial/components/PersonalExpenseForm").then((m) => ({ default: m.PersonalExpenseForm }));

const LoanForm = lazy(loadLoanForm);
const LoanSimulator = lazy(() => import("@/features/loans/components/LoanSimulator").then((m) => ({ default: m.LoanSimulator })));
const LoanList = lazy(() => import("@/features/loans/components/LoanList").then((m) => ({ default: m.LoanList })));
const ClientForm = lazy(loadClientForm);
const ClientList = lazy(() => import("@/features/clients/components/ClientList").then((m) => ({ default: m.ClientList })));
const ProductForm = lazy(() => import("@/features/sales/components/ProductForm").then((m) => ({ default: m.ProductForm })));
const SaleForm = lazy(() => import("@/features/sales/components/SaleForm").then((m) => ({ default: m.SaleForm })));
const ProductSalesView = lazy(() =>
  import("@/features/sales/components/ProductSalesView").then((m) => ({ default: m.ProductSalesView })),
);
const ClientRankingView = lazy(() =>
  import("@/features/clients/components/ranking/ClientRankingView").then((m) => ({ default: m.ClientRankingView })),
);

const BillingCalendar = lazy(() =>
  import("@/components/BillingCalendar").then((m) => ({ default: m.BillingCalendar })),
);
const ExpenseForm = lazy(loadExpenseForm);
import { ModuleErrorBoundary } from "@/components/ModuleErrorBoundary";

const ExpenseList = lazy(() => import("@/features/financial/components/ExpenseList").then((m) => ({ default: m.ExpenseList })));
const PersonalExpenseForm = lazy(loadPersonalExpenseForm);
const PersonalExpenseList = lazy(() =>
  import("@/features/financial/components/PersonalExpenseList").then((m) => ({ default: m.PersonalExpenseList })),
);
const IncomeList = lazy(() => import("@/features/financial/components/IncomeList").then((m) => ({ default: m.IncomeList })));
const CreditCardList = lazy(() => import("@/features/creditCards/components/CreditCardList").then((m) => ({ default: m.CreditCardList })));
const PiggyBankList = lazy(() => import("@/features/piggyBanks/components/PiggyBankList").then((m) => ({ default: m.PiggyBankList })));
const ClientLoanHistory = lazy(() =>
  import("@/features/clients/components/ClientLoanHistory").then((m) => ({ default: m.ClientLoanHistory })),
);
const UserManagement = lazy(() => import("@/features/admin/components/UserManagement").then((m) => ({ default: m.UserManagement })));
const PlanManagement = lazy(() => import("@/features/admin/components/PlanManagement").then((m) => ({ default: m.PlanManagement })));
const BackupExport = lazy(() => import("@/components/BackupExport").then((m) => ({ default: m.BackupExport })));
const WebhookSettings = lazy(() =>
  import("@/components/WebhookSettings").then((m) => ({ default: m.WebhookSettings })),
);
const PlanSubscribers = lazy(() =>
  import("@/features/admin/components/PlanSubscribers").then((m) => ({ default: m.PlanSubscribers })),
);
const VehicleCardList = lazy(() =>
  import("@/features/vehicles/components/VehicleCardList").then((m) => ({ default: m.VehicleCardList })),
);
const LocadorPopoverContent = lazy(() =>
  import("@/features/vehicles/components/LocadorPopoverContent").then((m) => ({ default: m.LocadorPopoverContent })),
);
const LocadorList = lazy(() => import("@/features/vehicles/components/LocadorList").then((m) => ({ default: m.LocadorList })));
const VehicleExpenseForm = lazy(() =>
  import("@/features/vehicles/components/VehicleExpenseForm").then((m) => ({ default: m.VehicleExpenseForm })),
);
const NotificationSettings = lazy(() =>
  import("@/components/NotificationSettings").then((m) => ({ default: m.NotificationSettings })),
);
const MetasTab = lazy(() =>
  import("@/features/piggyBanks/components/metas/MetasTab").then((m) => ({ default: m.MetasTab })),
);
const AccountantReport = lazy(() =>
  import("@/components/AccountantReport").then((m) => ({ default: m.AccountantReport })),
);
const TelegramBotsHub = lazy(() =>
  import("@/features/telegram/components/TelegramBotsHub").then((m) => ({ default: m.TelegramBotsHub })),
);
const WhatsappBillingCard = lazy(() =>
  import("@/components/WhatsappBillingCard").then((m) => ({ default: m.WhatsappBillingCard })),
);
const WhatsappReportCard = lazy(() =>
  import("@/components/WhatsappReportCard").then((m) => ({ default: m.WhatsappReportCard })),
);
const WhatsappAutoBillingCard = lazy(() =>
  import("@/components/WhatsappAutoBillingCard").then((m) => ({ default: m.WhatsappAutoBillingCard })),
);
const WhatsappAssistantCard = lazy(() =>
  import("@/components/WhatsappAssistantCard").then((m) => ({ default: m.WhatsappAssistantCard })),
);
const Settings = lazy(() => import("@/components/Settings").then((m) => ({ default: m.Settings })));
const SystemSettings = lazy(() => import("@/components/SystemSettings").then((m) => ({ default: m.SystemSettings })));
const SalaryTab = lazy(() => import("@/features/payroll/components/salary/SalaryTab").then((m) => ({ default: m.SalaryTab })));
const BoletosTab = lazy(() => import("@/features/boletos/components/boletos/BoletosTab").then((m) => ({ default: m.BoletosTab })));

// Direct import for the constant used at render time
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";

import { NotificationsFeedButton } from "@/components/NotificationsFeedButton";
const DashboardOverview = lazy(() => import("@/features/dashboard/components/DashboardOverview").then((m) => ({ default: m.DashboardOverview })));
const LedgerView = lazy(() => import("@/features/financial/components/LedgerView").then((m) => ({ default: m.LedgerView })));

import { useApprovalRequests } from "@/features/admin/hooks/useApprovalRequests";
import { usePendingCount } from "@/lib/offline/sync";
import { useApprovalPushAlerts } from "@/features/admin/hooks/useApprovalPushAlerts";

import {
  getPrimaryFormKindForTab,
  isAutomaticIdlePrefetchAllowed,
} from "@/lib/primaryFormLoader";

// Prefetch most-used chunks after idle.
// Respects slow connections and skips when the user opted into Data Saver.
const prefetchChunks = () => {
  void import("@/features/loans/components/LoanList");
  void loadLoanForm();
  void import("@/components/BillingCalendar");
  void import("@/features/clients/components/ClientList");
  void loadClientForm();
  void loadExpenseForm();
};
if (typeof window !== "undefined") {
  const conn = (navigator as any).connection ?? null;
  if (isAutomaticIdlePrefetchAllowed(conn)) {
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(prefetchChunks, { timeout: 3000 });
    } else {
      setTimeout(prefetchChunks, 2000);
    }
  }
}

// Prefetch trigger for the primary FAB — matches handlePrimaryAction's mapping.
// Safe to call repeatedly: dynamic import module cache dedupes downloads.
const prefetchPrimaryFormForTab = (
  tab: string,
  clientSubTab: string,
  incExpTab: string,
  expenseSubTab: string,
) => {
  const kind = getPrimaryFormKindForTab({ tab, clientSubTab, incExpTab, expenseSubTab });
  if (kind === "loan") void loadLoanForm();
  else if (kind === "client") void loadClientForm();
  else if (kind === "expense") void loadExpenseForm();
  else if (kind === "personal-expense") void loadPersonalExpenseForm();
};


// Lazy load hooks only when needed
import { useLoans } from "@/features/loans/hooks/useLoans";
import { useClients } from "@/features/clients/hooks/useClients";
import { useAutoAdjustCreditLimits } from "@/features/creditCards/hooks/useAutoAdjustCreditLimits";
import { usePatrimonioPublisher } from "@/features/piggyBanks/hooks/usePatrimonioPublisher";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useIncomes } from "@/features/financial/hooks/useIncomes";
import { useVehicleRegistry } from "@/features/vehicles/hooks/useVehicleRegistry";
import { useLocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";

type Tab =
  | "overview"
  | "dashboard"
  | "clients"
  | "products"
  | "vehicles"
  | "overdue"
  | "metas"
  | "expenses"
  | "boletos"
  | "salary"
  | "accountant"
  | "calendar"
  | "settings"
  | "system"
  | "help";
type ClientSubTab = "clientes" | "veiculos" | "ranking";
type VehicleSubTab = "veiculos" | "locadores";
type PlanMgmtSubTab = "subscribers" | "plans";
type OverdueSubTab = "bot-telegram" | "whatsapp-cobranca";
type ExpenseSubTab = "business" | "personal";
type PersonalSubTab = "expenses" | "cards";
type IncExpTab = "incomes" | "expenses";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: FolderOpen },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "vehicles" as Tab, label: "Veículos", icon: Car },
  { id: "calendar" as Tab, label: "Calendário", icon: CalendarDays },
  { id: "clients" as Tab, label: "Cadastro", icon: UserPlus },
  { id: "expenses" as Tab, label: "Financeiro", icon: Receipt },
  { id: "boletos" as Tab, label: "Boletos", icon: Barcode },
  { id: "salary" as Tab, label: "Salário", icon: Wallet },
  { id: "accountant" as Tab, label: "Contador", icon: Calculator },

  { id: "overdue" as Tab, label: "Relatório", icon: Folders },
  { id: "metas" as Tab, label: "Metas", icon: Target },
  { id: "settings" as Tab, label: "Configurações", icon: SettingsIcon },
  { id: "system" as Tab, label: "Sistema", icon: Sliders },
  { id: "help" as Tab, label: "Assistente IA", icon: Sparkles },
];

const LEGACY_CLIENT_PLAN_TAB_IDS = new Set([
  "overview",
  "dashboard",
  "calendar",
  "clients",
  "products",
  "vehicles",
  "expenses",
  "overdue",
]);

const tabHelp: Record<Tab, { title: string; items: string[] }> = {
  overview: {
    title: "Dashboard Geral",
    items: [
      "Visão consolidada do seu negócio: receitas, despesas e saldo.",
      "Capital na Rua e Total a Receber refletem a carteira ativa, enquanto a Saúde da Operação reage ao período selecionado e ao risco vivo.",
      "Use o seletor de período (Dia/Semana/Mês) para filtrar entradas e saídas.",
      "O gráfico mostra o histórico dos últimos 12 meses.",
    ],
  },
  dashboard: {
    title: "Empréstimos",
    items: [
      "Cadastre novos empréstimos clicando em 'Novo Empréstimo'.",
      "Escolha o tipo de contrato: Semanal, Quinzenal ou Mensal.",
      "Registre pagamentos de parcela, juros ou pagamentos parciais.",
      "Clique em 'Mais detalhes' para ver o cronograma completo de parcelas.",
      "Use os filtros e etiquetas para organizar seus contratos.",
    ],
  },
  calendar: {
    title: "Calendário de Cobrança",
    items: [
      "Visualize todas as parcelas a vencer no calendário.",
      "Dias com bolinha vermelha = parcelas atrasadas.",
      "Dias com bolinha amarela = parcelas a vencer.",
      "Clique em um dia para ver os detalhes das cobranças.",
    ],
  },
  clients: {
    title: "Cadastro",
    items: [
      "Cadastre seus clientes com nome, CPF/CNPJ, telefone e endereço.",
      "Use o score para classificar a confiabilidade do cliente.",
      "Cadastre e gerencie veículos na sub-aba Veículos.",
      "Clientes inativos não aparecem na lista de novos empréstimos.",
    ],
  },
  products: {
    title: "Vendas",
    items: [
      "Registre vendas avulsas ou streaming.",
      "Escolha entre pagamento fixo (único) ou recorrente (parcelado).",
      "Para vendas recorrentes, defina a frequência: Semanal, Quinzenal ou Mensal.",
    ],
  },
  vehicles: {
    title: "Aluguel de Veículos",
    items: [
      "Registre contratos de aluguel de veículos.",
      "Controle parcelas e pagamentos recorrentes.",
      "Acompanhe vencimentos e inadimplência.",
    ],
  },
  expenses: {
    title: "Despesas",
    items: [
      "Registre despesas fixas ou recorrentes do seu negócio.",
      "Marque despesas como pagas para controlar o fluxo de caixa.",
      "Categorize suas despesas para melhor organização.",
    ],
  },
  accountant: {
    title: "Contador",
    items: ["Relatório consolidado para fins contábeis.", "Inclui receitas, despesas, vendas e empréstimos."],
  },
  overdue: {
    title: "Relatório",
    items: [
      "Lista todos os empréstimos com parcelas em atraso.",
      "Também mostra empréstimos que vencem hoje.",
      "Use para priorizar suas cobranças diárias.",
    ],
  },
  metas: {
    title: "Metas",
    items: [
      "Evolução Anual: gráfico de cada meta com barras (Realizado) e linha (Meta).",
      "Configuração de Metas: cadastro, edição e regras de herança das metas.",
      "Todos os cálculos usam a mesma fonte do Dashboard.",
    ],
  },
  salary: {
    title: "Salário",
    items: [
      "Cadastre funcionários CLT, autônomos ou prestadores.",
      "Gere a folha mensal automaticamente para todos os ativos.",
      'Ao confirmar um pagamento, uma despesa em "Salários" é criada e o saldo é atualizado.',
      "Emita contracheques em PDF para qualquer competência paga.",
    ],
  },
  boletos: {
    title: "Boletos",
    items: [
      "Cole a linha digitável (47 dígitos) ou o código de barras (44 dígitos) para decodificar.",
      "Mostra banco emissor, vencimento e valor calculados localmente — funciona offline.",
      "Valida os dígitos verificadores e alerta sobre digitação errada.",
      'Use "Salvar como despesa" para enviar o boleto direto para a aba Despesas.',
    ],
  },
  settings: {
    title: "Configurações",
    items: [
      "Centralize preferências de exibição (tema e ocultar valores).",
      "Configure todos os canais de notificação: push, e-mail, Telegram e webhook.",
      "Gerencie locadores, plano de assinatura e usuários (admins).",
      "Faça backup ou exporte seus dados.",
      "Use 'Limpar cache' para forçar atualização do app sem perder dados.",
    ],
  },
  system: {
    title: "Sistema",
    items: [
      "Funcionalidades administrativas e operacionais centralizadas.",
      "Administração: gerenciamento de usuários, aprovações e links de convite.",
      "Conta e Assinatura: visualize e altere o plano contratado.",
      "Personalização: identidade visual e temas do sistema.",
    ],
  },
  help: {
    title: "Assistente IA",
    items: [
      "Chat com o assistente de IA do app.",
      "Tire dúvidas sobre qualquer recurso: cadastros, cofrinhos, relatórios, integrações.",
      "As respostas são geradas em tempo real e cobrem todas as funcionalidades.",
    ],
  },
};
function HideValuesToggle() {
  const { hidden, toggle } = useHideValues();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-9 w-9"
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}
function HideValuesQuickAction() {
  const { hidden, toggle } = useHideValues();
  return (
    <Button variant="outline" size="sm" onClick={toggle} className="justify-start">
      {hidden ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
      {hidden ? "Mostrar valores" : "Ocultar valores"}
    </Button>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={`min-w-[76px] flex-1 flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 transition-colors active:scale-95 disabled:opacity-60 disabled:pointer-events-none ${
        active ? "bg-primary/15 text-primary" : "bg-muted/50 text-foreground hover:bg-muted"
      }`}
    >
      <Icon className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
      <span className="text-[11px] font-medium leading-tight text-center whitespace-nowrap">{label}</span>
    </button>
  );
}

function HideValuesQuickTile() {
  const { hidden, toggle } = useHideValues();
  return (
    <QuickAction
      icon={hidden ? EyeOff : Eye}
      label={hidden ? "Mostrar" : "Ocultar"}
      active={hidden}
      onClick={toggle}
    />
  );
}


function DesktopSidebarExtras({
  refreshing,
  onRefresh,
  onOpenNotifications,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  onOpenNotifications: () => void;
}) {
  const { hidden, toggle } = useHideValues();
  return (
    <>
      <SidebarMenuAction
        icon={hidden ? EyeOff : Eye}
        label={hidden ? "Mostrar valores" : "Ocultar valores"}
        onClick={toggle}
      />
      <SidebarMenuAction
        icon={RefreshCw}
        label={refreshing ? "Atualizando..." : "Atualizar"}
        onClick={onRefresh}
      />
      <SidebarMenuAction
        icon={Bell}
        label="Notificações"
        onClick={onOpenNotifications}
      />
    </>
  );
}

// Fonte oficial de scroll do app: `window`.
// A política completa vive em src/lib/scrollPolicy.ts (Fase 4) — nenhum
// componente deve chamar window.scrollTo diretamente.




const Index = () => {
  const { signOut, role, allowedTabs, linkedClientIds, loading, user } = useAuth();
  // Escopo de persistência da navegação por usuário — definido antes de
  // qualquer hook persistido ler o storage (evita vazar contexto entre contas).
  setNavigationScope(user?.id ?? null);
  const roleAllowedTabs = useMyRoleTabs(role);
  const navigate = useNavigate();
  const scrollPolicy = useScrollPolicy();

  const { subscription, isActive: hasActiveSub } = useSubscription();
  const accessLock = useAccessLock();
  const { branding: appBranding } = useAppBranding();
  const brandName = appBranding.brand_name;
  // Tab state - declared early so hooks can use it for lazy loading
  const [tab, setTabState] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    if (urlTab && tabConfig.some((t) => t.id === urlTab)) return urlTab as Tab;
    const saved = sessionStorage.getItem("activeTab");
    if (saved && tabConfig.some((t) => t.id === saved)) return saved as Tab;
    // Mobile: abrir direto em "Empréstimos" (fluxo principal). Desktop: "overview".
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    return isMobileViewport ? "dashboard" : "overview";
  });
  // Troca de aba com fluxos separados (ver src/lib/tabNavigation.ts):
  //  - source="user":    clique manual do usuário; único caminho que rola,
  //                      e apenas quando a aba realmente muda.
  //  - source="internal": sincronizações (refetch, permissões, visibleTabs,
  //                      app:navigate para mesma aba) → NUNCA rolam.
  // Usa functional setState para não decidir com `tab` capturado por closure.
  const changeTab = useCallback(
    (nextTab: Tab, options: { source: "user" | "internal"; scrollToTop?: boolean } = { source: "user" }) => {
      setTabState((currentTab) => {
        const r = resolveTabTransition(currentTab, nextTab, options);
        if (!r.changed) return currentTab;

        // Fase 3/4: cada aba guarda a própria posição (política em scrollPolicy).
        scrollPolicy.rememberScrollFor(currentTab);
        if (r.shouldScroll) scrollPolicy.restoreScrollFor(r.nextTab);


        try { sessionStorage.setItem("activeTab", r.nextTab); } catch { /* noop */ }
        try { localStorage.setItem(NAV_KEYS.activeTab, r.nextTab); } catch { /* noop */ }
        return r.nextTab;
      });
    },
    [],
  );
  const setTab = useCallback((t: Tab) => changeTab(t, { source: "user" }), [changeTab]);
  /**
   * Clique no botão de aba (menu inferior mobile / sidebar desktop-tablet).
   * Se a aba já está ativa → rolagem suave ao topo. Caso contrário, troca a aba
   * normalmente (comportamento inalterado).
   */
  const activeTabRef = useRef<Tab>(tab);
  activeTabRef.current = tab;
  const handleTabButtonClick = useCallback(
    (t: Tab) => {
      if (activeTabRef.current === t) {
        scrollPolicy.smoothScrollToTop();
        return;
      }
      changeTab(t, { source: "user" });
    },
    [changeTab, scrollPolicy],
  );


  const syncTabInternally = useCallback(
    (t: Tab) => changeTab(t, { source: "internal", scrollToTop: false }),
    [changeTab],
  );

  // A barra inferior permanece sempre fixa; não reagimos ao teclado virtual.


  // Atualiza apenas a aba (reload simples), preservando cache e localStorage.
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleHardRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    window.location.reload();
  };

  // Listen for in-app navigation requests (e.g. shortcut to Telegram report config)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { tab: targetTab, subTab, scrollTo } = detail;
      // Eventos `app:navigate` são navegações intencionais do usuário disparadas
      // por outros componentes (ex.: notificações). Se pedirem a aba já ativa,
      // o `changeTab` faz no-op — não rola. Se pedirem outra aba, rola.
      if (targetTab) changeTab(targetTab, { source: "user" });
      if (targetTab === "overdue" && subTab) {
        setOverdueSubTab(subTab === "whatsapp-cobranca" ? "whatsapp-cobranca" : "bot-telegram");
      }
      if (scrollTo) {
        // Determinístico: aguarda aba/subaba/dados renderizarem o elemento
        // (MutationObserver) em vez de apostar num timeout fixo de 250ms.
        void revealDeepLinkTarget(scrollTo);
      }
    };
    window.addEventListener("app:navigate", handler as EventListener);
    return () => window.removeEventListener("app:navigate", handler as EventListener);
  }, [changeTab]);

  // Read initial loan filter/view from URL query params (for push notification deep links)
  const urlParams = new URLSearchParams(window.location.search);
  const initialLoanCategory = urlParams.get("filter") as any;
  const initialLoanView = urlParams.get("view") as any;
  const {
    loans,
    payments,
    installmentSchedules,
    addLoan,
    addPayment,
    addPartialPayment,
    payOffLoan,
    addInterestOnlyPayment,
    amortizeLoan,
    renegotiateLoan,
    updateLoan,
    deleteLoan,
    deletePayment,
    saveSchedule,
  } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();

  // Automatic credit-limit adjustment per client (auto mode only)
  useAutoAdjustCreditLimits(clients, loans, payments);

  // Calcula e sincroniza snapshots de patrimônio globalmente (para metas, etc)
  usePatrimonioPublisher(loans, payments, installmentSchedules);

  // Prefetch financeiro/veículos assim que o app abre. As telas continuam usando
  // os mesmos hooks/caches, mas os dados já chegam antes do usuário trocar de aba.
  const needsProducts = true;
  const needsExpenses = true;
  const needsVehicles = tab === "clients" || tab === "vehicles";
  const needsLocadores = tab === "vehicles" || tab === "settings" || tab === "clients";

  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale } =
    useProducts(needsProducts);
  const { expenses, addExpense, payExpense, payExpensePartial, unpayExpense, deleteExpense, updateExpense } = useExpenses(needsExpenses);
  // Exclusão com escopo em séries (somente esta / esta e futuras / todas),
  // válida para despesas pessoais e empresariais.
  const deleteExpenseScoped = useCallback(
    (expense: Expense, month: string, scope: DeleteScope) =>
      applyScopedExpenseDelete({
        target: expense,
        month,
        scope,
        expenses,
        onDelete: (id) => deleteExpense(id),
        onUpdateNotes: (id, notes) => updateExpense(id, { notes }),
      }),
    [expenses, deleteExpense, updateExpense],
  );
  const { incomes: prefetchedIncomes } = useIncomes(true);
  void prefetchedIncomes;
  const {
    vehicles: registeredVehicles,
    add: addVehicle,
    update: updateVehicle,
    remove: removeVehicle,
  } = useVehicleRegistry(needsVehicles);
  const { locador, locadores, save: saveLocador, remove: removeLocador } = useLocadorInfo(needsLocadores);
  const [clientSubTab, setClientSubTab] = usePersistentOption<ClientSubTab>("clients", ["clientes", "veiculos", "ranking"], "clientes");
  const [loanSubTab, setLoanSubTab] = usePersistentOption<"loans" | "history">("loans", ["loans", "history"], "loans");
  // Histórico do Cliente: lista e histórico têm snapshots independentes.
  // A lista só é restaurada no FECHAMENTO; ao abrir, o histórico sempre começa no topo.
  const clientListScrollRef = useRef(0);
  const historyScrollRef = useRef(0);
  const scrollOperationId = useRef(0);
  const cancelClientListRestoreRef = useRef<(() => void) | null>(null);
  const beginClientHistoryScrollOperation = useCallback(() => {
    scrollOperationId.current += 1;
    cancelClientListRestoreRef.current?.();
    cancelClientListRestoreRef.current = null;
    scrollPolicy.cancelPendingRestore();
    return scrollOperationId.current;
  }, [scrollPolicy]);
  const openClientHistory = useCallback(() => {
    const operationId = beginClientHistoryScrollOperation();
    clientListScrollRef.current = getScrollTop(getAppScrollContainer());
    historyScrollRef.current = 0;
    setLoanSubTab("history");
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (scrollOperationId.current === operationId) setScrollTop(getAppScrollContainer(), historyScrollRef.current);
      });
    } else {
      setScrollTop(getAppScrollContainer(), historyScrollRef.current);
    }
  }, [beginClientHistoryScrollOperation, setLoanSubTab]);
  const closeClientHistory = useCallback(() => {
    const operationId = beginClientHistoryScrollOperation();
    const targetPosition = clientListScrollRef.current;
    setLoanSubTab("loans");
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (scrollOperationId.current !== operationId) return;
        cancelClientListRestoreRef.current = restoreScrollWhenReady(targetPosition, {
          container: getAppScrollContainer(),
          maxAttempts: 10,
          isCurrent: () => scrollOperationId.current === operationId,
        });
      });
    } else {
      cancelClientListRestoreRef.current = restoreScrollWhenReady(targetPosition, {
        container: getAppScrollContainer(),
        maxAttempts: 10,
        isCurrent: () => scrollOperationId.current === operationId,
      });
    }
  }, [beginClientHistoryScrollOperation, setLoanSubTab]);
  useEffect(() => {
    return () => cancelClientListRestoreRef.current?.();
  }, []);
  const [vehicleSubTab, setVehicleSubTab] = usePersistentOption<VehicleSubTab>("vehicles", ["veiculos", "locadores"], "veiculos");
  const [planMgmtSubTab, setPlanMgmtSubTab] = usePersistentOption<PlanMgmtSubTab>("planMgmt", ["subscribers", "plans"], "subscribers");
  const [overdueSubTab, setOverdueSubTab] = useState<OverdueSubTab>("bot-telegram");
  // Ao sair da aba Relatório, reinicia o sub-tab para "Bot Telegram"
  // (assim, na próxima vez que abrir, ela começa lá — sem sobrescrever
  // sub-tabs definidos por deep links via app:navigate).
  useEffect(() => {
    if (tab !== "overdue") setOverdueSubTab("bot-telegram");
  }, [tab]);
  const [expenseSubTab, setExpenseSubTab] = usePersistentOption<ExpenseSubTab>("expenses", ["business", "personal"], "personal");
  const [personalSubTab, setPersonalSubTab] = usePersistentOption<PersonalSubTab>("personal", ["expenses", "cards"], "expenses");
  const [incExpTab, setIncExpTab] = usePersistentOption<IncExpTab>("financial", ["incomes", "expenses"], "incomes");

  // Filter data by linked clients if user has client restrictions
  const hasClientFilter = Array.isArray(linkedClientIds) && linkedClientIds.length > 0;
  const filteredClients = hasClientFilter ? clients.filter((c) => linkedClientIds.includes(c.id)) : clients;
  const linkedClientNames = hasClientFilter ? filteredClients.map((c) => c.name.toLowerCase()) : [];
  const filteredLoans = hasClientFilter
    ? loans.filter(
        (l) =>
          (l.borrowerId && linkedClientIds.includes(l.borrowerId)) ||
          linkedClientNames.includes((l.borrowerName || "").toLowerCase()),
      )
    : loans;
  const filteredPayments = hasClientFilter
    ? payments.filter((p) => filteredLoans.some((l) => l.id === p.loanId))
    : payments;
  const filteredInstallments = hasClientFilter
    ? installmentSchedules.filter((s) => filteredLoans.some((l) => l.id === s.loanId))
    : installmentSchedules;
  const filteredSales = hasClientFilter
    ? sales.filter((s) => {
        const clientNames = filteredClients.map((c) => c.name.toLowerCase());
        return clientNames.includes((s.customerName || "").toLowerCase());
      })
    : sales;

  const nonVehicleExpenses = expenses.filter((e) => !isVehicleExpenseForVehicles(e));
  const businessExpenses = nonVehicleExpenses.filter((e) => (e.scope ?? "business") === "business");
  const personalExpenses = nonVehicleExpenses.filter((e) => e.scope === "personal");
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showLoanSimulator, setShowLoanSimulator] = useState(false);
  const [loanFormPrefill, setLoanFormPrefill] = useState<{
    clientId: string | null;
    clientName: string;
    amount: number;
    interestRate: number;
    installments: number;
    customInstallmentValue?: number | null;
  } | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [productsSubTab, setProductsSubTab] = usePersistentOption<string>("products", ["venda", "produtos", "historico", "estoque", "clientes", "relatorios"], "venda");
  useEffect(
    () => onAppUIEvent("PRODUCTS_SUBTAB_CHANGE", ({ subTab }) => setProductsSubTab(subTab as string)),
    [setProductsSubTab],
  );
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPersonalExpenseForm, setShowPersonalExpenseForm] = useState(false);
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const [expenseDefaults, setExpenseDefaults] = useState<any | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);
  const [shortcutsEditorOpen, setShortcutsEditorOpen] = useState(false);
  const DEFAULT_PINNED: Tab[] = ["overview", "clients", "dashboard", "expenses"];
  const [pinnedTabs, setPinnedTabs] = useState<Tab[]>(() => {
    try {
      const raw = localStorage.getItem("hvcred-pinned-tabs");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
          return parsed.slice(0, 4) as Tab[];
        }
      }
    } catch {
      /* noop */
    }
    return DEFAULT_PINNED;
  });
  const persistPinned = (next: Tab[]) => {
    setPinnedTabs(next);
    try {
      localStorage.setItem("hvcred-pinned-tabs", JSON.stringify(next));
    } catch {
      /* noop */
    }
  };
  const togglePinned = (id: Tab) => {
    if (pinnedTabs.includes(id)) {
      persistPinned(pinnedTabs.filter((t) => t !== id));
    } else if (pinnedTabs.length < 4) {
      persistPinned([...pinnedTabs, id]);
    }
  };
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const reorderPinned = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pinnedTabs.length || to >= pinnedTabs.length) return;
    const next = [...pinnedTabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistPinned(next);
  };
  const { pendingCount: approvalPendingCount } = useApprovalRequests();
  const { count: offlinePendingCount } = usePendingCount();
  const morePendingCount = (role === "admin" ? approvalPendingCount : 0) + offlinePendingCount;
  useApprovalPushAlerts();
  const isMobile = useIsMobile();
  const isMobileOrTablet = useIsMobileOrTablet();
  // Treat unresolved role as read-only to prevent flashing create buttons
  // before the role loads (defensive — viewers should never see write actions).
  const isReadOnly = loading || role === null || role === "visualizador";

  // Swipe from left edge to open sidebar on mobile
  useEffect(() => {
    if (!isMobileOrTablet) return;
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = Math.abs(touchEndY - touchStartY);
      if (touchStartX < 30 && deltaX > 50 && deltaY < 100) {
        setSidebarOpen(true);
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobileOrTablet]);

  const visibleTabs = React.useMemo(() => tabConfig.filter((t) => {
    if (loading) return false;
    // "Ajuda" é sempre visível para qualquer usuário logado.
    if (t.id === "help") return !!user;
    // Tabs marcadas como adminOnly são exclusivas para administradores
    if ((t as any).adminOnly && role !== "admin") return false;
    // Visualizador: aba de Configurações é ocultada por completo (apenas leitura
    // não tem nada acionável aqui; backups, telegram, branding, etc. exigem escrita).
    if (t.id === "settings" && role === "visualizador") return false;
    // Admin sempre vê todas as abas (ignora plano e demais restrições).
    if (role === "admin") return true;
    if (!user) return false;
    // Permissão por papel (role_tab_permissions): se a aba não está liberada
    // para o papel do usuário, esconde.
    if (Array.isArray(roleAllowedTabs) && !roleAllowedTabs.includes(t.id)) return false;
    // Permissão por usuário (user_tab_permissions): se houver lista, exigir presença.
    const isLegacyClientPlanTabs =
      role === "cliente" &&
      Array.isArray(allowedTabs) &&
      allowedTabs.length > 0 &&
      allowedTabs.every((id) => LEGACY_CLIENT_PLAN_TAB_IDS.has(id));
    if (Array.isArray(allowedTabs) && !isLegacyClientPlanTabs) return allowedTabs.includes(t.id);
    return true;
  }), [loading, user, role, roleAllowedTabs, allowedTabs]);

  const visibleTabsSignature = React.useMemo(
    () => visibleTabs.map((t) => t.id).join(","),
    [visibleTabs],
  );

  const isAjudaAllowed = !loading && !!user;

  const canAccessTab = (id: Tab) => visibleTabs.some((t) => t.id === id);
  // Tab existe na configuração geral mas o usuário não tem permissão →
  // exibimos página de "acesso negado" em vez de redirecionar silenciosamente.
  const tabAccessDenied = !loading && tabConfig.some((t) => t.id === tab) && !visibleTabs.some((t) => t.id === tab);

  // Itens da barra inferior mobile: prioriza pinnedTabs (ordem do usuário),
  // completa com as demais abas visíveis e limita a 4 (o 5º slot é "Mais").
  const bottomItems = (() => {
    const pinnedVisible = pinnedTabs
      .map((id) => tabConfig.find((t) => t.id === id))
      .filter((t): t is (typeof tabConfig)[number] => !!t && visibleTabs.some((v) => v.id === t.id));
    const remaining = visibleTabs.filter((v) => !pinnedVisible.some((p) => p.id === v.id));
    return [...pinnedVisible, ...remaining].slice(0, 4);
  })();
  const bottomItemIds = bottomItems.map((i) => i.id);

  useEffect(() => {
    if (loading) return;
    if (visibleTabs.length === 0) return;
    const currentExists = visibleTabs.some((v) => v.id === tab);
    if (currentExists) return;
    const next = visibleTabs[0].id;
    if (next !== tab) syncTabInternally(next);
    // visibleTabsSignature intentionally used instead of visibleTabs for stable identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tab, visibleTabsSignature]);

  // Extrato agora abre como dialog (não é mais aba)
  const [ledgerOpen, setLedgerOpen] = useState(false);
  useEffect(() => {
    const handler = () => setLedgerOpen(true);
    window.addEventListener("open-ledger", handler);
    return () => window.removeEventListener("open-ledger", handler);
  }, []);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hvcred-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  // Apply dark class to html element
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Força fullscreen real via Fullscreen API quando o app está instalado como PWA.
  // Necessário porque alguns navegadores/fabricantes Android (Samsung Internet,
  // WebViews customizadas, etc.) não respeitam de forma confiável o
  // "display": "fullscreen" do manifest.json, caindo para "standalone"
  // (que mantém a barra de status visível). A Fullscreen API exige um gesto
  // do usuário para ser acionada, então é disparada no primeiro toque/clique.
  useEffect(() => {
    const isStandaloneOrFullscreen =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;

    if (!isStandaloneOrFullscreen) return;

    const tryEnterFullscreen = () => {
      const el = document.documentElement as any;
      if (document.fullscreenElement) return; // já em fullscreen
      const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (request) {
        request.call(el).catch(() => {
          // Silenciosamente ignora falhas (ex: navegador não suporta,
          // ou usuário já saiu do fullscreen manualmente).
        });
      }
    };

    document.addEventListener("click", tryEnterFullscreen, { once: true });
    document.addEventListener("touchend", tryEnterFullscreen, { once: true });

    return () => {
      document.removeEventListener("click", tryEnterFullscreen);
      document.removeEventListener("touchend", tryEnterFullscreen);
    };
  }, []);

  const [themeSwitching, setThemeSwitching] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const toggleTheme = () => {
    if (themeSwitching) return;
    setThemeSwitching(true);
    const next = !dark;
    const root = document.documentElement;
    // Ativa transição suave de cores/sombras apenas durante a troca
    root.classList.add("theme-transitioning");
    setDark(next);
    root.classList.toggle("dark", next);
    localStorage.setItem("hvcred-theme", next ? "dark" : "light");
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      setThemeSwitching(false);
    }, 380);
  };

  const handleQuickNav = (path: string) => {
    if (pendingNav) return;
    setPendingNav(path);
    setMoreOpen(false);
    setTimeout(() => {
      navigate(path);
      setPendingNav(null);
    }, 150);
  };

  const handlePrimaryAction = () => {
    if (tab === "dashboard") setShowLoanForm(true);
    else if (tab === "clients" && clientSubTab === "clientes") setShowClientForm(true);
    else if (tab === "expenses") {
      if (incExpTab === "incomes") {
        window.dispatchEvent(new CustomEvent("open-income-form"));
      } else if (expenseSubTab === "personal") setShowPersonalExpenseForm(true);
      else setShowExpenseForm(true);
    } else if (tab === "products") {
      if (productsSubTab === "estoque") setShowProductForm(true);
      else setShowSaleForm(true);
    } else if (tab === "vehicles") setShowSaleForm(true);
  };

  const primaryLabel =
    tab === "dashboard"
      ? "Novo Empréstimo"
      : tab === "clients" && clientSubTab === "clientes"
        ? "Novo Cliente"
        : tab === "expenses"
          ? incExpTab === "incomes"
            ? "Nova Receita"
            : expenseSubTab === "personal"
              ? personalSubTab === "cards"
                ? ""
                : "Nova Despesa Pessoal"
              : "Nova Despesa"
          : tab === "products"
            ? productsSubTab === "estoque"
              ? "Novo Produto"
              : "Novo Lançamento"
            : tab === "vehicles"
              ? "Novo Aluguel"
              : "";

  const initialSidebarWidth = getInitialAppSidebarWidth();
  const planLabelShort = hasActiveSub && subscription
    ? subscription.product_id === "basico_plan"
      ? "Plano Básico"
      : subscription.product_id === "profissional_plan"
        ? "Plano Profissional"
        : subscription.product_id === "empresarial_plan"
          ? "Plano Empresarial"
          : "Plano ativo"
    : "Sem plano ativo";

  return (
    <HideValuesProvider>
      <div
        className="min-h-[100dvh] bg-background"
        style={{
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${isMobile ? "72px" : "0px"})`,
          paddingLeft: !isMobile
            ? `var(--app-sidebar-width, ${initialSidebarWidth}px)`
            : "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          transition: "padding-left 75ms ease-out",
        }}
      >
        <SubscriptionBanner />
        <TrialBanner />

        {!isMobile && (
          <AppSidebar
            brandName={brandName}
            tabs={visibleTabs}
            activeTab={tab}
            onSelect={(id) => handleTabButtonClick(id as Tab)}
            user={{
              display_name: user?.user_metadata?.display_name,
              email: user?.email,
            }}
            role={role}
            planLabel={planLabelShort}
            hasActiveSub={hasActiveSub}
            onOpenPlans={() => navigate("/planos")}
            onSignOut={signOut}
            onToggleTheme={toggleTheme}
            darkMode={dark}
            popoverExtras={
              <DesktopSidebarExtras
                refreshing={refreshing}
                onRefresh={handleHardRefresh}
                onOpenNotifications={() => setNotificationsOpen(true)}
              />
            }
          />
        )}

        {!isMobile && (
          <NotificationsFeedButton
            loans={filteredLoans}
            payments={filteredPayments}
            installmentSchedules={filteredInstallments}
            clients={filteredClients}
            onSelectLoan={(loanId) => {
              setTab("dashboard");
              try {
                sessionStorage.setItem("highlightLoanId", loanId);
              } catch {}
            }}
            open={notificationsOpen}
            onOpenChange={setNotificationsOpen}
            hideTrigger
          />
        )}



        <main
          data-app-scroll-container
          className="app-page-bg max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-8 pb-24 sm:py-6 space-y-4 sm:space-y-6"
          style={{
            paddingTop: isMobile ? "calc(env(safe-area-inset-top) + 0.25rem)" : undefined,
            paddingBottom: isMobile ? "calc(env(safe-area-inset-bottom) + 6rem)" : undefined,
          }}
        >
          {(() => {
            const current = tabConfig.find((t) => t.id === tab);
            if (!current) return null;
            const Icon = current.icon;
            return (
              <div className="flex items-center gap-2 sm:gap-3 pt-1">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{current.label}</h1>
              </div>
            );
          })()}
          {/* Fase 4: boundary por módulo — o fallback é um skeleton coerente com
              a aba ativa (key={tab}) para evitar saltos de altura. */}
          <Suspense key={tab} fallback={<TabSkeleton tab={tab} />}
          >
            {tabAccessDenied ? (
              <Card className="max-w-xl mx-auto mt-8">
                <CardContent className="py-10 text-center space-y-4">
                  <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Acesso negado</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Você não possui permissão para acessar esta aba. Solicite ao administrador a liberação em{" "}
                      <span className="font-medium">Sistema &gt; Usuários &gt; Abas</span>.
                    </p>
                  </div>
                  {visibleTabs.length > 0 && (
                    <Button onClick={() => setTab(visibleTabs[0].id)} variant="outline">
                      Ir para {visibleTabs[0].label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : accessLock.locked && tab !== "system" ? (
              <AccessLockScreen
                reason={accessLock.reason}
                blockedReason={accessLock.blockedReason}
                planExpiresAt={accessLock.planExpiresAt}
                onGoToSystem={() => setTab("system")}
              />
            ) : (
              <>
                {tab === "overview" && (
                  <SubscriptionGate requiredTier={1} featureName="Dashboard">
                    <DashboardOverview
                      loans={filteredLoans}
                      sales={filteredSales}
                      payments={filteredPayments}
                      expenses={expenses.filter(
                        (e) => (e.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(e),
                      )}
                      installmentSchedules={filteredInstallments}
                      clients={clients}
                      onDeletePayment={deletePayment}
                      onDeleteSale={deleteSale}
                      onDeleteLoan={deleteLoan}
                      readOnly={isReadOnly}
                    />
                  </SubscriptionGate>
                )}
                {tab === "dashboard" && (
                  <SubscriptionGate requiredTier={2} featureName="Empréstimos">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-foreground">
                            {loanSubTab === "history" ? "Histórico do Cliente" : ""}
                          </h2>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {loanSubTab === "history" && (
                            <button
                              type="button"
                              onClick={closeClientHistory}
                              className="md:hidden h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              aria-label="Voltar para Empréstimos"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          )}
                          {loanSubTab === "history" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={closeClientHistory}
                              className="gap-1.5 hidden md:inline-flex"
                            >
                              <FolderOpen className="h-4 w-4" />
                              Voltar para Empréstimos
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className={loanSubTab === "history" ? "hidden" : undefined} aria-hidden={loanSubTab === "history"}>
                        <LoanList
                          loans={filteredLoans}
                          payments={filteredPayments}
                          installmentSchedules={filteredInstallments}
                          onPayment={addPayment}
                          onPartialPayment={addPartialPayment}
                          onFullPayment={payOffLoan}
                          onInterestPayment={addInterestOnlyPayment}
                          onAmortize={amortizeLoan}
                          onRenegotiate={renegotiateLoan}
                          onUpdate={updateLoan}
                          onDelete={deleteLoan}
                          onDeletePayment={deletePayment}
                          onSaveSchedule={saveSchedule}
                          readOnly={isReadOnly}
                          initialCategory={initialLoanCategory}
                          initialView={initialLoanView}
                          clients={filteredClients}
                          onOpenClientHistory={openClientHistory}
                          onOpenSimulator={!isReadOnly ? () => setShowLoanSimulator(true) : undefined}
                        />
                      </div>
                      {loanSubTab === "history" && (
                        // Suspense local: a suspensão do chunk do histórico não
                        // pode desmontar a árvore da aba nem a instância da lista.
                        <LazyDialogBoundary
                          fallback={
                            <div className="min-h-[60vh] py-12 text-center text-sm text-muted-foreground">
                              Carregando histórico…
                            </div>
                          }
                        >
                          <ClientLoanHistory loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} />
                        </LazyDialogBoundary>
                      )}
                    </div>
                  </SubscriptionGate>
                )}
                {tab === "clients" && (
                  <SubscriptionGate requiredTier={2} featureName="Cadastro">
                    <div>
                    <nav className="flex gap-1 mb-4 bg-muted/60 p-1 rounded-xl border border-border/50 overflow-x-auto scrollbar-hide">
                      <button
                        onClick={() => setClientSubTab("clientes")}
                        className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                          clientSubTab === "clientes"
                            ? "bg-background !text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        }`}
                      >
                        <Users className={`h-4 w-4 shrink-0 ${clientSubTab === "clientes" ? "!text-primary" : ""}`} /> Clientes
                      </button>
                      {!isReadOnly && (
                        <button
                          onClick={() => setClientSubTab("veiculos")}
                          className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                            clientSubTab === "veiculos"
                              ? "bg-background !text-primary shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                          }`}
                        >
                          <Car className={`h-4 w-4 shrink-0 ${clientSubTab === "veiculos" ? "!text-primary" : ""}`} /> Cadastro de Veículos
                        </button>
                      )}
                      <button
                        onClick={() => setClientSubTab("ranking")}
                        className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                          clientSubTab === "ranking"
                            ? "bg-background !text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        }`}
                      >
                        <Trophy className={`h-4 w-4 shrink-0 ${clientSubTab === "ranking" ? "!text-primary" : ""}`} /> 🏆 Ranking de Clientes
                      </button>
                    </nav>
                    {clientSubTab === "clientes" && (
                      <ClientList
                        clients={filteredClients}
                        loans={filteredLoans}
                        payments={filteredPayments}
                        installmentSchedules={filteredInstallments}
                        onDelete={deleteClient}
                        onUpdate={updateClient}
                        readOnly={isReadOnly}
                      />
                    )}
                    {clientSubTab === "ranking" && (
                      <ClientRankingView />
                    )}
                    {clientSubTab === "veiculos" && !isReadOnly && (
                      <>
                        <nav className="flex gap-1 mb-4 bg-muted/60 p-1 rounded-xl border border-border/50 overflow-x-auto scrollbar-hide">
                          <button
                            onClick={() => setVehicleSubTab("veiculos")}
                            className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                              vehicleSubTab === "veiculos"
                                ? "bg-background !text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            }`}
                          >
                            <Car className={`h-4 w-4 shrink-0 ${vehicleSubTab === "veiculos" ? "!text-primary" : ""}`} /> Veículos
                          </button>
                          <button
                            onClick={() => setVehicleSubTab("locadores")}
                            className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                              vehicleSubTab === "locadores"
                                ? "bg-background !text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            }`}
                          >
                            <User className={`h-4 w-4 shrink-0 ${vehicleSubTab === "locadores" ? "!text-primary" : ""}`} /> Dados do Locador
                          </button>
                        </nav>

                        {vehicleSubTab === "veiculos" && (
                          <>
                            <h2 className="text-lg font-semibold text-foreground mb-4">
                              Veículos Cadastrados ({registeredVehicles.length})
                            </h2>
                            <VehicleCardList
                              vehicles={registeredVehicles}
                              onAdd={addVehicle}
                              onUpdate={updateVehicle}
                              onDelete={removeVehicle}
                              readOnly={isReadOnly}
                            />
                          </>
                        )}
                        {vehicleSubTab === "locadores" && (
                          <>
                            <h2 className="text-lg font-semibold text-foreground mb-4">
                              Locadores ({locadores.length})
                            </h2>
                            <LocadorList
                              locadores={locadores}
                              onSave={saveLocador}
                              onDelete={removeLocador}
                              readOnly={isReadOnly}
                            />
                          </>
                        )}
                      </>
                    )}
                    </div>
                  </SubscriptionGate>
                )}
                {tab === "expenses" && (
                  <SubscriptionGate requiredTier={2} featureName="Financeiro">
                    <div className="max-w-full">
                      <div className="w-full bg-muted/50 rounded-xl p-1 flex gap-0.5 mb-4">
                        <button
                          onClick={() => setIncExpTab("incomes")}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            incExpTab === "incomes"
                              ? "bg-background !text-primary shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Wallet className="h-4 w-4 shrink-0" />
                          <span className="truncate">Receitas</span>
                        </button>
                        <button
                          onClick={() => setIncExpTab("expenses")}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            incExpTab === "expenses"
                              ? "bg-background !text-primary shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Receipt className="h-4 w-4 shrink-0" />
                          <span className="truncate">Despesas</span>
                        </button>
                      </div>

                      {incExpTab === "incomes" ? (
                        <ModuleErrorBoundary name="Receitas">
                          <IncomeList readOnly={isReadOnly} />
                        </ModuleErrorBoundary>
                      ) : (

                        <div>
                          <div className="w-full bg-muted/50 rounded-xl p-1 flex gap-0.5 mb-4">
                            <button
                              onClick={() => setExpenseSubTab("business")}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                expenseSubTab === "business"
                                  ? "bg-background !text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Receipt className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Despesas Empresa</span>
                            </button>
                            <button
                              onClick={() => setExpenseSubTab("personal")}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                expenseSubTab === "personal"
                                  ? "bg-background !text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <User className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Despesas Pessoais</span>
                            </button>
                          </div>
                          {expenseSubTab === "business" ? (
                            <div className="-mx-3 sm:mx-0">
                              <h2 className="text-lg font-semibold text-foreground mb-4 px-3 sm:px-0">
                                Despesas Empresa
                              </h2>
                              <ModuleErrorBoundary name="Despesas Empresa">
                              <PersonalExpenseList
                                mode="business"
                                expenses={businessExpenses}
                                onPay={payExpense}
                                onUnpay={unpayExpense}
                                onDelete={deleteExpense}
                                onPayPartial={payExpensePartial}
                                onDeleteScoped={deleteExpenseScoped}
                                onUpdate={updateExpense}
                                readOnly={isReadOnly}
                              />
                              </ModuleErrorBoundary>
                            </div>
                          ) : (
                            <div className="-mx-3 sm:mx-0">
                              <h2 className="text-lg font-semibold text-foreground mb-4 px-3 sm:px-0">
                                Despesas Pessoais
                              </h2>
                              <ModuleErrorBoundary name="Despesas Pessoais">
                              <PersonalExpenseList
                                expenses={personalExpenses}
                                onPay={payExpense}
                                onUnpay={unpayExpense}
                                onDelete={deleteExpense}
                                onPayPartial={payExpensePartial}
                                onDeleteScoped={deleteExpenseScoped}
                                onUpdate={updateExpense}
                                readOnly={isReadOnly}
                                afterEvolution={({ selectedMonth }) => (
                                  <div className="grid grid-cols-1 gap-4 md:gap-4">
                                    <section className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-3 sm:p-4 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] overflow-hidden">
                                      <CreditCardList readOnly={isReadOnly} referenceMonth={selectedMonth} />
                                    </section>
                                  </div>
                                )}
                              />
                              </ModuleErrorBoundary>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </SubscriptionGate>
                )}
                {tab === "accountant" && (
                  <SubscriptionGate requiredTier={2} featureName="Contador">
                    <AccountantReport loans={loans} payments={payments} sales={sales} expenses={expenses} />
                  </SubscriptionGate>
                )}
                {tab === "salary" && (
                  <SubscriptionGate requiredTier={2} featureName="Salário">
                    <SalaryTab readOnly={isReadOnly} />
                  </SubscriptionGate>
                )}
                {tab === "boletos" && <BoletosTab readOnly={isReadOnly} />}
                {tab === "overdue" && (
                  <SubscriptionGate requiredTier={2} featureName="Relatórios">
                    <div>
                      <nav className="flex gap-1 mb-4 bg-muted/60 p-1 rounded-xl border border-border/50 overflow-x-auto scrollbar-hide">
                        {([
                          { id: "bot-telegram", label: "Bot Telegram", Icon: Send },
                          { id: "whatsapp-cobranca", label: "Cobrança WhatsApp", Icon: MessageCircle },
                        ] as const).map(({ id, label, Icon }) => {
                          const active = overdueSubTab === id;
                          return (
                            <button
                              key={id}
                              onClick={() => setOverdueSubTab(id)}
                              className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap flex-1 min-w-0 ${
                                active
                                  ? "bg-background !text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                              }`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${active ? "!text-primary" : ""}`} />
                              <span className="truncate">{label}</span>
                            </button>
                          );
                        })}
                      </nav>
                      {overdueSubTab === "bot-telegram" && <TelegramBotsHub />}
                      {overdueSubTab === "whatsapp-cobranca" && (
                        <div className="space-y-4">
                          <WhatsappBillingCard />
                        </div>
                      )}
                    </div>
                  </SubscriptionGate>
                )}
                {tab === "metas" && (
                  <SubscriptionGate requiredTier={2} featureName="Metas">
                    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>}>
                      <MetasTab
                        loans={filteredLoans}
                        payments={filteredPayments}
                        expenses={expenses.filter((e) => (e.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(e))}
                        clients={clients}
                        installmentSchedules={filteredInstallments}
                        readOnly={isReadOnly}
                      />
                    </Suspense>
                  </SubscriptionGate>
                )}
                {tab === "calendar" && (
                  <SubscriptionGate requiredTier={2} featureName="Calendário">
                    <BillingCalendar
                      loans={filteredLoans}
                      payments={filteredPayments}
                      installmentSchedules={filteredInstallments}
                      sales={filteredSales}
                      onPayment={addPayment}
                      onPartialPayment={addPartialPayment}
                      onFullPayment={payOffLoan}
                      onInterestPayment={addInterestOnlyPayment}
                      onUpdate={updateLoan}
                      readOnly={isReadOnly}
                    />
                  </SubscriptionGate>
                )}
                {tab === "products" && (
                  <SubscriptionGate requiredTier={2} featureName="Vendas">
                    <ProductSalesView
                      sales={filteredSales.filter((s) => s.businessType !== "aluguel_veiculo")}
                      onDeleteSale={deleteSale}
                      onUpdateSale={updateSale}
                      clients={filteredClients}
                      readOnly={isReadOnly}
                    />
                  </SubscriptionGate>
                )}
                {tab === "vehicles" && (
                  <SubscriptionGate requiredTier={2} featureName="Veículos">
                    <ProductSalesView
                      sales={filteredSales.filter((s) => s.businessType === "aluguel_veiculo")}
                      onDeleteSale={deleteSale}
                      onUpdateSale={updateSale}
                      clients={filteredClients}
                      expenses={expenses}
                      onAddExpense={addExpense}
                      onPayExpense={payExpense}
                      onDeleteExpense={deleteExpense}
                      onUpdateExpense={updateExpense}
                      readOnly={isReadOnly}
                      isVehicleView
                      locadores={locadores}
                      onSaveLocador={saveLocador}
                    />
                  </SubscriptionGate>
                )}
                {tab === "settings" && canAccessTab("settings") && (
                  <Settings
                    backup={{
                      loans,
                      payments,
                      clients,
                      sales,
                      expenses,
                      onImportLoans: async (imported) => {
                        const BATCH = 5;
                        for (let i = 0; i < imported.length; i += BATCH) {
                          const batch = imported.slice(i, i + BATCH);
                          await Promise.all(
                            batch.map(async (loan) => {
                              const { totalPaid, ...loanData } = loan;
                              const loanId = await addLoan(loanData);
                              if (loanId && totalPaid && totalPaid > 0) {
                                await addPartialPayment(loanId, totalPaid, loan.startDate);
                              }
                            }),
                          );
                        }
                      },
                      onImportClients: async (imported) => {
                        await Promise.all(imported.map((client) => addClient(client)));
                      },
                      onImportSales: async (imported) => {
                        await Promise.all(imported.map((sale) => addSale(sale)));
                      },
                      onImportExpenses: async (imported) => {
                        await Promise.all(imported.map((expense) => addExpense(expense)));
                      },
                      onImportPayments: async (imported) => {
                        const loanIdSet = new Set(loans.map((l) => l.id));
                        let importedCount = 0;
                        let skipped = 0;
                        const valid = imported.filter((p) => {
                          if (!loanIdSet.has(p.loanId)) {
                            skipped++;
                            return false;
                          }
                          return true;
                        });
                        const BATCH = 5;
                        for (let i = 0; i < valid.length; i += BATCH) {
                          const batch = valid.slice(i, i + BATCH);
                          await Promise.all(
                            batch.map(async (p) => {
                              await addPartialPayment(p.loanId, p.amount, p.date);
                              importedCount++;
                            }),
                          );
                        }
                        return { imported: importedCount, skipped };
                      },
                    }}
                    locadores={locadores}
                    onSaveLocador={saveLocador}
                    onRemoveLocador={removeLocador}
                    isReadOnly={isReadOnly}
                    dark={dark}
                    onToggleTheme={toggleTheme}
                  />
                )}
                {tab === "system" && canAccessTab("system") && <SystemSettings />}
                {tab === "help" && canAccessTab("help") && <HelpChat />}
              </>
            )}
          </Suspense>
        </main>

        {/* Fase 4: um único FAB expansível por aba (substitui pilhas de FABs). */}
        {(() => {
          const showPrimary =
            !isReadOnly &&
            !!primaryLabel &&
            ((tab === "dashboard" && loanSubTab !== "history") ||
              tab === "expenses" ||
              tab === "products" ||
              tab === "vehicles" ||
              (tab === "clients" && clientSubTab === "clientes"));

          const actions: SpeedDialAction[] = [];
          if (tab === "vehicles") {
            if (!isReadOnly) {
              actions.push({
                id: "vehicle-expense",
                label: "Registrar Despesa",
                icon: Receipt,
                onSelect: () => setShowVehicleExpenseForm(true),
              });
            }
            actions.push({
              id: "vehicle-history",
              label: "Histórico de Pagamentos",
              icon: History,
              onSelect: () => window.dispatchEvent(new CustomEvent("open-vehicle-history")),
            });
          }
          if (!isReadOnly && tab === "products" && productsSubTab === "estoque") {
            actions.push({
              id: "stock-adjust",
              label: "Ajuste de Estoque",
              icon: Wrench,
              onSelect: () => window.dispatchEvent(new CustomEvent("open-stock-adjust")),
            });
          }

          if (!showPrimary && actions.length === 0) return null;
          const primary: SpeedDialAction = showPrimary
            ? { id: "primary", label: primaryLabel, icon: Plus, onSelect: handlePrimaryAction }
            : actions.shift()!;

          return (
            <SpeedDialFab
              primary={primary}
              actions={actions}
              isMobile={isMobile}
              onPrefetch={() => prefetchPrimaryFormForTab(tab, clientSubTab, incExpTab, expenseSubTab)}
            />
          );
        })()}


        {/* Cada overlay lazy tem seu próprio Suspense (fallback=null) para que a
            suspensão do chunk do modal NÃO desmonte a árvore do Suspense externo
            da aba — o que anteriormente causava o scroll voltar ao topo ao abrir
            um modal pela primeira vez na sessão. */}
        <LazyDialogBoundary>
          {showLoanForm && (
            <LoanForm
              onAdd={addLoan}
              onSaveSchedule={saveSchedule}
              onClose={() => {
                setShowLoanForm(false);
                setLoanFormPrefill(null);
              }}
              clients={clients}
              onAddClient={addClient}
              loans={loans}
              payments={payments}
              installmentSchedules={installmentSchedules}
              existingTags={[...new Set(loans.flatMap((l) => l.tags || []))]}
              prefill={loanFormPrefill ?? undefined}
            />
          )}
          {showLoanSimulator && (
            <LoanSimulator
              open={showLoanSimulator}
              onOpenChange={setShowLoanSimulator}
              clients={clients}
              onCreateLoanFromScenario={async (p) => {
                let resolvedClientId = p.clientId;
                if (!resolvedClientId && p.autoCreateClient && p.clientName?.trim()) {
                  try {
                    const newId = await addClient({
                      name: p.clientName.trim(),
                      phone: "",
                      email: "",
                      cpf: "",
                      cnpj: "",
                      rg: "",
                      address: "",
                      city: "",
                      state: "",
                      score: 0,
                      notes: "Cliente criado automaticamente a partir de simulação",
                      active: true,
                      isVehicleRental: false,
                      nacionalidade: "",
                      estadoCivil: "",
                      profissao: "",
                      bairro: "",
                      isManager: false,
                      defaultInterestRate: null,
                      autoBillingEnabled: true,
                    } as any);
                    if (newId) {
                      resolvedClientId = newId;
                      toast.success(`Cliente "${p.clientName.trim()}" cadastrado automaticamente`);
                    }
                  } catch (err) {
                    console.error("Erro ao criar cliente automaticamente:", err);
                    toast.error("Não foi possível cadastrar o cliente automaticamente");
                  }
                }
                setLoanFormPrefill({
                  clientId: resolvedClientId,
                  clientName: p.clientName,
                  amount: p.amount,
                  interestRate: p.interestRate,
                  installments: p.installments,
                  customInstallmentValue: p.customInstallmentValue,
                });
                setShowLoanSimulator(false);
                setShowLoanForm(true);
              }}
            />
          )}
          {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
          {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
          {showSaleForm && (
            <SaleForm
              onAdd={addSale}
              onClose={() => setShowSaleForm(false)}
              clients={clients}
              defaultBusinessType={
                tab === "vehicles" ? "aluguel_veiculo" : productsSubTab === "streaming" ? "streaming" : undefined
              }
              registeredVehicles={registeredVehicles}
              locadores={locadores}
              products={products}
            />
          )}
          {showExpenseForm && (
            <ExpenseForm
              onAdd={addExpense}
              onClose={() => {
                setShowExpenseForm(false);
                setExpenseDefaults(null);
              }}
              scope={expenseDefaults?.scope === "personal" ? "personal" : "business"}
              defaults={expenseDefaults ?? undefined}
            />
          )}
          {showPersonalExpenseForm && (
            <PersonalExpenseForm onAdd={addExpense} onClose={() => setShowPersonalExpenseForm(false)} />
          )}
          {showVehicleExpenseForm && (
            <VehicleExpenseForm onAdd={addExpense} onClose={() => setShowVehicleExpenseForm(false)} />
          )}
        </LazyDialogBoundary>

        {/* Mobile Bottom Navigation */}
        {isMobile && (
          <>
            <nav
              className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-card/90 backdrop-blur-xl backdrop-saturate-150 shadow-[0_-4px_20px_-8px_hsl(0_0%_0%/0.25)] animate-fade-in"
              style={{
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
              }}
            >
              <div className="flex items-stretch justify-around h-[60px]">

                {bottomItems.map((item) => {
                  const active = tab === item.id;
                  const Icon = item.icon;
                  const highlighted = item.id === "dashboard";
                  if (highlighted) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTabButtonClick(item.id)}
                        aria-label={item.label}
                        className="group relative flex flex-1 flex-col items-center justify-end gap-1 px-1 pb-1 touch-manipulation focus-visible:outline-none active:scale-[0.94] transition-transform duration-200"
                      >
                        <div
                          className={`-mt-6 flex items-center justify-center h-12 w-12 rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.55)] ring-4 ring-background transition-transform duration-200 ease-out ${active ? "scale-105" : "scale-100 group-hover:scale-105"}`}
                        >
                          <Icon className="h-6 w-6" strokeWidth={2.4} />
                        </div>
                        <span
                          className={`text-[10px] leading-none tracking-tight transition-[font-weight,color] duration-200 ${active ? "font-medium text-primary" : "font-medium text-muted-foreground/80"}`}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabButtonClick(item.id)}
                      className={`group flex flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 touch-manipulation focus-visible:outline-none transition-colors duration-200 active:scale-[0.94] ${
                        active ? "text-primary" : "text-muted-foreground/80 hover:text-foreground active:text-foreground"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center h-6 transition-transform duration-200 ease-out ${active ? "scale-110" : "scale-100"}`}
                      >
                        <Icon
                          className={`h-[22px] w-[22px] transition-[filter] duration-200 ${active ? "drop-shadow-[0_3px_6px_hsl(var(--primary)/0.35)]" : ""}`}
                          strokeWidth={active ? 2.4 : 1.9}
                        />
                      </div>
                      <span
                        className={`text-[10px] leading-none tracking-tight transition-[font-weight,color] duration-200 ${active ? "font-medium text-primary" : "font-medium text-muted-foreground/80"}`}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`block h-[3px] rounded-full transition-all duration-300 ease-out ${active ? "w-5 bg-primary opacity-100" : "w-0 bg-primary opacity-0"}`}
                      />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={`group relative flex flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 touch-manipulation focus-visible:outline-none transition-colors duration-200 active:scale-[0.94] ${
                    moreOpen ? "text-primary" : "text-muted-foreground/80 hover:text-foreground active:text-foreground"
                  }`}
                >
                  <div
                    className={`relative flex items-center justify-center h-6 transition-transform duration-200 ease-out ${moreOpen ? "scale-110" : "scale-100"}`}
                  >
                    <Menu
                      className={`h-[22px] w-[22px] transition-[filter] duration-200 ${moreOpen ? "drop-shadow-[0_3px_6px_hsl(var(--primary)/0.35)]" : ""}`}
                      strokeWidth={moreOpen ? 2.4 : 1.9}
                    />
                    {morePendingCount > 0 && (
                      <span
                        aria-label={`${morePendingCount} pendência${morePendingCount === 1 ? "" : "s"}`}
                        className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none flex items-center justify-center shadow-[0_2px_6px_-1px_hsl(var(--destructive)/0.6)] ring-2 ring-card animate-fade-in"
                      >
                        {morePendingCount > 99 ? "99+" : morePendingCount}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] leading-none tracking-tight transition-[font-weight,color] duration-200 ${moreOpen ? "font-medium text-primary" : "font-medium text-muted-foreground/80"}`}
                  >
                    Mais
                  </span>
                  <span
                    className={`block h-[3px] rounded-full transition-all duration-300 ease-out ${moreOpen ? "w-5 bg-primary opacity-100" : "w-0 bg-primary opacity-0"}`}
                  />
                </button>
              </div>
            </nav>


            {/* Mais — Bottom Sheet (mobile) */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetContent
                side="bottom"
                className="rounded-t-3xl max-h-[92dvh] overflow-hidden p-0 border-t border-border/60 bg-background/95 backdrop-blur-2xl [&>button]:hidden"
                style={{ paddingTop: 0, paddingBottom: 0 }}
              >
                {(() => {
                  const planLabel =
                    hasActiveSub && subscription
                      ? subscription.product_id === "basico_plan"
                        ? "Básico"
                        : subscription.product_id === "profissional_plan"
                          ? "Profissional"
                          : subscription.product_id === "empresarial_plan"
                            ? "Empresarial"
                            : "Plano"
                      : null;
                  const displayName =
                    user?.user_metadata?.display_name || user?.email || "Usuário";
                  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url;
                  const initials =
                    (displayName || "U")
                      .split(/[\s@._-]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0]?.toUpperCase() ?? "")
                      .join("") || "U";
                  const roleLabel =
                    role === "admin"
                      ? "Administrador"
                      : role === "gerente"
                        ? "Gerente"
                        : role === "cliente"
                          ? "Cliente"
                          : role === "visualizador"
                            ? "Visualizador"
                            : "Membro";

                  const MOBILE_GROUPS: { label: string; ids: string[] }[] = [
                    { label: "Principal", ids: ["overview", "calendar", "metas"] },
                    { label: "Financeiro", ids: ["expenses", "dashboard", "products", "boletos", "salary", "vehicles"] },
                    { label: "Gestão", ids: ["clients", "accountant", "overdue"] },
                    { label: "Ferramentas", ids: ["help", "settings", "system"] },
                  ];
                  const groupedNav = MOBILE_GROUPS.map((g) => ({
                    label: g.label,
                    items: g.ids
                      .map((id) => visibleTabs.find((v) => v.id === id))
                      .filter((t): t is (typeof visibleTabs)[number] => !!t),
                  })).filter((g) => g.items.length > 0);

                  return (
                    <div
                      className="flex flex-col h-[92dvh] overflow-hidden"
                      style={{ paddingTop: "env(safe-area-inset-top)" }}
                    >
                      {/* Drag handle */}
                      <div className="pt-2 pb-1 flex justify-center shrink-0">
                        <div className="h-1.5 w-12 rounded-full bg-muted-foreground/25" />
                      </div>

                      {/* Header */}
                      <div className="px-5 pt-2 pb-3 flex items-start gap-3 shrink-0">
                        <div className="shrink-0">
                          <AppLogo area="header" alt={brandName} className="w-auto h-10" rounded />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-bold text-foreground tracking-tight truncate">
                            {brandName}
                          </h2>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">
                            Controle de Empréstimos
                          </p>
                          {planLabel && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
                                <Crown className="h-3 w-3" />
                                {planLabel}
                              </span>
                            </div>
                          )}
                        </div>
                        <SheetClose asChild>
                          <button
                            type="button"
                            aria-label="Fechar menu"
                            className="shrink-0 flex items-center justify-center h-11 w-11 rounded-2xl bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground shadow-sm border border-border/40 transition-colors active:scale-95"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </SheetClose>
                      </div>

                      {/* Scrollable body */}
                      <div
                        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
                      >
                        {/* User card */}
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            if (canAccessTab("settings" as Tab)) setTab("settings" as Tab);
                          }}
                          className="w-full flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-sm hover:bg-muted/40 active:scale-[0.99] transition-all text-left"
                        >
                          <div className="h-11 w-11 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold overflow-hidden shrink-0">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              initials
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{roleLabel}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>

                        {/* Grouped navigation */}
                        {groupedNav.map((group, gi) => (
                          <div key={group.label}>
                            <div className="flex items-center justify-between px-1 mb-1.5">
                              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.label}
                              </h3>
                              {gi === 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShortcutsEditorOpen(true)}
                                  aria-label="Editar atalhos"
                                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                >
                                  <Sliders className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
                              {group.items.map((item, i) => {
                                const active = tab === item.id;
                                const Icon = item.icon;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      handleTabButtonClick(item.id);
                                      setMoreOpen(false);
                                    }}
                                    aria-label={item.label}
                                    aria-current={active ? "page" : undefined}
                                    className={`w-full min-h-12 flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                      i > 0 ? "border-t border-border/40" : ""
                                    } ${active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50 active:bg-muted"}`}
                                  >
                                    <span
                                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        active ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"
                                      }`}
                                    >
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {/* Notificações */}
                        <div>
                          <h3 className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Notificações
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setMoreOpen(false);
                              setTimeout(() => setMobileNotifOpen(true), 250);
                            }}
                            aria-label="Abrir feed de notificações"
                            className="w-full min-h-12 flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 shadow-sm hover:bg-muted/50 active:bg-muted transition-colors"
                          >
                            <span className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                              <Bell className="h-4 w-4" />
                            </span>
                            <span className="flex-1 text-sm font-medium text-foreground text-left">
                              Feed de notificações
                            </span>
                            {morePendingCount > 0 && (
                              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                                {morePendingCount > 99 ? "99+" : morePendingCount}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        </div>

                        {/* Plano card */}
                        {planLabel && (
                          <button
                            type="button"
                            onClick={() => {
                              setMoreOpen(false);
                              navigate("/planos");
                            }}
                            aria-label={`Você está no plano ${planLabel}`}
                            className="w-full flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 px-4 py-3 shadow-sm hover:from-primary/15 hover:to-primary/10 active:scale-[0.99] transition-all text-left"
                          >
                            <span className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                              <Crown className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">
                                Você está no plano {planLabel}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                Aproveite todos os recursos disponíveis.
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        )}
                      </div>

                      {/* Fixed footer: Ações rápidas + Sair */}
                      <div
                        className="shrink-0 px-4 pt-3 pb-4 border-t border-border/50 bg-background/95 backdrop-blur-sm space-y-3"
                        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
                      >
                        {/* Ações rápidas */}
                        <div>
                          <h3 className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Ações rápidas
                          </h3>
                          <div className="rounded-2xl border border-border/50 bg-card p-2 shadow-sm">
                            <div className="flex items-stretch gap-1 overflow-x-auto">
                              <QuickAction
                                icon={refreshing ? Loader2 : RefreshCw}
                                label={refreshing ? "Atualizando" : "Atualizar"}
                                spinning={refreshing}
                                disabled={refreshing || !!pendingNav}
                                onClick={() => {
                                  handleHardRefresh();
                                  setMoreOpen(false);
                                }}
                              />
                              <QuickAction
                                icon={themeSwitching ? Loader2 : dark ? Sun : Moon}
                                label={themeSwitching ? "Aplicando" : dark ? "Claro" : "Escuro"}
                                active={dark}
                                spinning={themeSwitching}
                                disabled={themeSwitching}
                                onClick={toggleTheme}
                              />
                              {role === "admin" && (
                                <QuickAction
                                  icon={pendingNav === "/planejamento-do-dia" ? Loader2 : CalendarClock}
                                  label="Planejamento"
                                  spinning={pendingNav === "/planejamento-do-dia"}
                                  disabled={!!pendingNav}
                                  onClick={() => {
                                    handleQuickNav("/planejamento-do-dia");
                                    setMoreOpen(false);
                                  }}
                                />
                              )}
                              <HideValuesQuickTile />
                            </div>
                          </div>
                        </div>

                        {/* Sair */}
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            signOut();
                          }}
                          className="w-full min-h-12 flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 active:bg-destructive/15 text-destructive font-medium py-3 transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          <span className="text-sm">Sair da conta</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </SheetContent>
            </Sheet>


            {/* Feed de notificações controlado para mobile (acionado a partir do "Mais") */}
            {isMobile && (
              <NotificationsFeedButton
                hideTrigger
                open={mobileNotifOpen}
                onOpenChange={setMobileNotifOpen}
                loans={filteredLoans}
                payments={filteredPayments}
                installmentSchedules={filteredInstallments}
                clients={filteredClients}
                onSelectLoan={(loanId) => {
                  setTab("dashboard");
                  try {
                    sessionStorage.setItem("highlightLoanId", loanId);
                  } catch {}
                }}
              />
            )}

            {/* Editor de atalhos do menu inferior */}
            <Dialog open={shortcutsEditorOpen} onOpenChange={setShortcutsEditorOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-primary" /> Personalizar menu inferior
                  </DialogTitle>
                  <DialogDescription>
                    Escolha até 4 atalhos fixos para o menu inferior. Os demais ficam disponíveis em "Mais".
                  </DialogDescription>
                </DialogHeader>
                <div className="grid md:grid-cols-[1fr_220px] gap-4 my-2">
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pinnedTabs.length} de 4 selecionados</span>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => persistPinned(DEFAULT_PINNED)}
                      >
                        Restaurar padrão
                      </button>
                    </div>

                    {pinnedTabs.length > 1 && (
                      <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                          Ordem dos fixados (arraste para reordenar)
                        </p>
                        <div className="flex flex-col gap-1">
                          {pinnedTabs.map((id, idx) => {
                            const tab = visibleTabs.find((v) => v.id === id);
                            if (!tab) return null;
                            const isDragging = dragIndex === idx;
                            const isOver = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
                            return (
                              <div
                                key={id}
                                draggable
                                onDragStart={(e) => {
                                  setDragIndex(idx);
                                  e.dataTransfer.effectAllowed = "move";
                                  try {
                                    e.dataTransfer.setData("text/plain", String(idx));
                                  } catch {
                                    /* noop */
                                  }
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  if (dragOverIndex !== idx) setDragOverIndex(idx);
                                }}
                                onDragLeave={() => {
                                  if (dragOverIndex === idx) setDragOverIndex(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (dragIndex !== null) reorderPinned(dragIndex, idx);
                                  setDragIndex(null);
                                  setDragOverIndex(null);
                                }}
                                onDragEnd={() => {
                                  setDragIndex(null);
                                  setDragOverIndex(null);
                                }}
                                className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition-all cursor-grab active:cursor-grabbing select-none ${
                                  isDragging ? "opacity-40 scale-[0.98]" : ""
                                } ${isOver ? "border-primary ring-2 ring-primary/30" : "border-border/40"}`}
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-[10px] font-semibold rounded-full bg-primary text-primary-foreground h-5 min-w-5 px-1.5 flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                  <tab.icon className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-sm font-medium flex-1 truncate">{tab.label}</span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    aria-label="Mover para cima"
                                    disabled={idx === 0}
                                    onClick={() => reorderPinned(idx, idx - 1)}
                                    className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Mover para baixo"
                                    disabled={idx === pinnedTabs.length - 1}
                                    onClick={() => reorderPinned(idx, idx + 1)}
                                    className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-1.5 max-h-[40vh] overflow-y-auto pr-1">
                      {visibleTabs.map((t) => {
                        const checked = pinnedTabs.includes(t.id);
                        const order = checked ? pinnedTabs.indexOf(t.id) + 1 : null;
                        const disabled = !checked && pinnedTabs.length >= 4;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => !disabled && togglePinned(t.id)}
                            disabled={disabled}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                              checked
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : disabled
                                  ? "border-border/30 bg-muted/20 text-muted-foreground opacity-50 cursor-not-allowed"
                                  : "border-border/40 bg-card/50 text-foreground hover:border-primary/30 hover:bg-muted/40"
                            }`}
                          >
                            <div
                              className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${checked ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"}`}
                            >
                              <t.icon className="h-4 w-4" />
                            </div>
                            <span className="flex-1 text-sm font-medium">{t.label}</span>
                            {checked && order !== null && (
                              <span className="text-[10px] font-semibold rounded-full bg-primary text-primary-foreground h-5 min-w-5 px-1.5 flex items-center justify-center">
                                {order}
                              </span>
                            )}
                            <div
                              className={`h-5 w-5 rounded border flex items-center justify-center ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                            >
                              {checked && <Check className="h-3.5 w-3.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview ao vivo do menu inferior */}
                  <aside className="hidden md:flex flex-col items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pré-visualização
                    </p>
                    <div className="relative w-[200px] h-[380px] rounded-[28px] border-4 border-border/60 bg-background shadow-xl overflow-hidden flex flex-col">
                      <div className="h-5 bg-card/80 border-b border-border/30 flex items-center justify-center">
                        <div className="w-12 h-1 rounded-full bg-muted-foreground/30" />
                      </div>
                      <div className="flex-1 bg-gradient-to-b from-muted/20 to-card/40 p-2 space-y-1.5 overflow-hidden">
                        <div className="h-2 w-2/3 rounded bg-muted/60" />
                        <div className="h-2 w-1/2 rounded bg-muted/40" />
                        <div className="mt-2 h-12 rounded-md bg-card/70 border border-border/30" />
                        <div className="h-12 rounded-md bg-card/70 border border-border/30" />
                        <div className="h-12 rounded-md bg-card/70 border border-border/30" />
                      </div>
                      <div className="border-t border-border/40 bg-card/95 backdrop-blur">
                        <div className="flex items-stretch justify-around h-[52px]">
                          {pinnedTabs
                            .map((id) => visibleTabs.find((v) => v.id === id))
                            .filter((t): t is (typeof visibleTabs)[number] => !!t)
                            .map((item, idx) => {
                              const Icon = item.icon;
                              const active = idx === 0;
                              return (
                                <div
                                  key={item.id}
                                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 ${
                                    active ? "text-primary" : "text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
                                  <span
                                    className={`text-[8px] leading-none truncate max-w-full ${active ? "font-medium text-primary" : "font-medium"}`}
                                  >
                                    {item.label}
                                  </span>
                                  <span
                                    className={`block h-0.5 w-3 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                                  />
                                </div>
                              );
                            })}
                          <div className="relative flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 text-muted-foreground">
                            <div className="relative">
                              <Menu className="h-4 w-4" />
                              {morePendingCount > 0 && (
                                <span className="absolute -top-1 -right-1.5 min-w-[12px] h-[12px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[7px] font-bold leading-none flex items-center justify-center ring-1 ring-card">
                                  {morePendingCount > 9 ? "9+" : morePendingCount}
                                </span>
                              )}
                            </div>
                            <span className="text-[8px] leading-none font-medium">Mais</span>
                            <span className="block h-0.5 w-3 rounded-full bg-transparent" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
                      Reflete a ordem e os atalhos atualmente selecionados.
                    </p>
                  </aside>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShortcutsEditorOpen(false)}>
                    Fechar
                  </Button>
                  <Button onClick={() => setShortcutsEditorOpen(false)}>Concluído</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Extrato em Dialog (acionado pelo botão "Ver extrato") */}
        <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
          <DialogContent className="max-w-5xl w-[calc(100%-1rem)] sm:w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6">
            <DialogHeader>
              <DialogTitle>Extrato da Conta</DialogTitle>
              <DialogDescription>Histórico completo de entradas e saídas. Fonte única do saldo.</DialogDescription>
            </DialogHeader>
            <LedgerView readOnly={isReadOnly} />
          </DialogContent>
        </Dialog>
      </div>
    </HideValuesProvider>
  );
};

export default Index;
