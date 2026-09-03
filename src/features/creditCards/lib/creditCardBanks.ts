// Catálogo de bancos brasileiros com cores oficiais e iniciais para o ícone.
// As cores são tokens HSL puros (sem 'hsl(' ao redor) — usadas via style inline em gradientes.

export type CardBrand = "visa" | "mastercard" | "elo" | "amex" | "hipercard";

export interface BankInfo {
  id: string;
  name: string;
  short: string; // sigla/iniciais para o "logo"
  /** Tailwind gradient classes (from-/via-/to-) compostas por cores arbitrárias HSL. */
  gradient: string;
  /** Cor do texto sobre o cartão. */
  textClass: string;
}

export const BANKS: BankInfo[] = [
  { id: "nubank",        name: "Nubank",          short: "Nu",  gradient: "bg-gradient-to-br from-[hsl(282,67%,28%)] via-[hsl(282,67%,22%)] to-[hsl(282,80%,15%)]",  textClass: "text-white" },
  { id: "itau",          name: "Itaú",            short: "It",  gradient: "bg-gradient-to-br from-[hsl(28,100%,50%)] via-[hsl(220,90%,25%)] to-[hsl(220,90%,18%)]", textClass: "text-white" },
  { id: "bradesco",      name: "Bradesco",        short: "Br",  gradient: "bg-gradient-to-br from-[hsl(354,82%,48%)] via-[hsl(354,82%,38%)] to-[hsl(354,82%,28%)]", textClass: "text-white" },
  { id: "santander",     name: "Santander",       short: "Sa",  gradient: "bg-gradient-to-br from-[hsl(0,90%,50%)] via-[hsl(0,90%,40%)] to-[hsl(0,90%,28%)]",       textClass: "text-white" },
  { id: "bb",            name: "Banco do Brasil", short: "BB",  gradient: "bg-gradient-to-br from-[hsl(48,100%,50%)] via-[hsl(48,100%,42%)] to-[hsl(220,90%,25%)]", textClass: "text-[hsl(220,90%,15%)]" },
  { id: "caixa",         name: "Caixa",           short: "Cx",  gradient: "bg-gradient-to-br from-[hsl(208,82%,40%)] via-[hsl(208,82%,30%)] to-[hsl(28,100%,48%)]",  textClass: "text-white" },
  { id: "inter",         name: "Inter",           short: "In",  gradient: "bg-gradient-to-br from-[hsl(20,100%,55%)] via-[hsl(20,100%,45%)] to-[hsl(20,100%,32%)]", textClass: "text-white" },
  { id: "c6",            name: "C6 Bank",         short: "C6",  gradient: "bg-gradient-to-br from-[hsl(0,0%,18%)] via-[hsl(0,0%,10%)] to-[hsl(0,0%,4%)]",           textClass: "text-white" },
  { id: "xp",            name: "XP",              short: "XP",  gradient: "bg-gradient-to-br from-[hsl(0,0%,15%)] via-[hsl(0,0%,8%)] to-[hsl(48,100%,50%)]",        textClass: "text-white" },
  { id: "btg",           name: "BTG Pactual",     short: "BT",  gradient: "bg-gradient-to-br from-[hsl(0,0%,12%)] via-[hsl(0,0%,6%)] to-[hsl(0,0%,2%)]",            textClass: "text-white" },
  { id: "picpay",        name: "PicPay",          short: "Pi",  gradient: "bg-gradient-to-br from-[hsl(150,90%,38%)] via-[hsl(150,90%,28%)] to-[hsl(150,90%,18%)]", textClass: "text-white" },
  { id: "mercadopago",   name: "Mercado Pago",    short: "MP",  gradient: "bg-gradient-to-br from-[hsl(199,95%,55%)] via-[hsl(199,95%,42%)] to-[hsl(199,95%,28%)]", textClass: "text-white" },
  { id: "will",          name: "Will Bank",       short: "Wi",  gradient: "bg-gradient-to-br from-[hsl(155,80%,55%)] via-[hsl(155,80%,42%)] to-[hsl(155,80%,28%)]", textClass: "text-[hsl(0,0%,10%)]" },
  { id: "neon",          name: "Neon",            short: "Ne",  gradient: "bg-gradient-to-br from-[hsl(155,90%,50%)] via-[hsl(180,90%,40%)] to-[hsl(200,90%,30%)]", textClass: "text-[hsl(0,0%,10%)]" },
  { id: "sicoob",        name: "Sicoob",          short: "Sb",  gradient: "bg-gradient-to-br from-[hsl(155,75%,32%)] via-[hsl(155,75%,24%)] to-[hsl(155,75%,16%)]", textClass: "text-white" },
  { id: "sicredi",       name: "Sicredi",         short: "Sc",  gradient: "bg-gradient-to-br from-[hsl(120,60%,38%)] via-[hsl(120,60%,28%)] to-[hsl(120,60%,18%)]", textClass: "text-white" },
  { id: "safra",         name: "Safra",           short: "Sf",  gradient: "bg-gradient-to-br from-[hsl(220,30%,25%)] via-[hsl(220,30%,15%)] to-[hsl(220,30%,8%)]",  textClass: "text-white" },
  { id: "original",      name: "Original",        short: "Or",  gradient: "bg-gradient-to-br from-[hsl(120,80%,30%)] via-[hsl(120,80%,22%)] to-[hsl(120,80%,14%)]", textClass: "text-white" },
  { id: "pagbank",       name: "PagBank",         short: "Pa",  gradient: "bg-gradient-to-br from-[hsl(150,75%,38%)] via-[hsl(150,75%,28%)] to-[hsl(150,75%,18%)]", textClass: "text-white" },
  { id: "next",          name: "Next",            short: "Nx",  gradient: "bg-gradient-to-br from-[hsl(75,80%,55%)] via-[hsl(75,80%,40%)] to-[hsl(0,0%,12%)]",      textClass: "text-white" },
];

export const getBank = (id: string): BankInfo =>
  BANKS.find((b) => b.id === id) ?? {
    id: "",
    name: "Banco não selecionado",
    short: "—",
    gradient: "bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700",
    textClass: "text-white"
  };

export const BRANDS: { id: CardBrand; name: string }[] = [
  { id: "visa",       name: "Visa" },
  { id: "mastercard", name: "Mastercard" },
  { id: "elo",        name: "Elo" },
  { id: "amex",       name: "Amex" },
  { id: "hipercard",  name: "Hipercard" },
];

export const brandLabel = (id: string) =>
  BRANDS.find((b) => b.id === id)?.name ?? "—";
