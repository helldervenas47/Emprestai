import {
  Home, UtensilsCrossed, Car, HeartPulse, GraduationCap, Gamepad2,
  ShoppingBag, Receipt, CreditCard, Repeat, PawPrint, Gift, Package,
  Plane, Dumbbell, Music, Film, Book, Coffee, Wrench, Smartphone,
  Wifi, Zap, Droplet, Briefcase, Baby, Sparkles, Hammer, Heart, Fuel,
  type LucideIcon,
} from "lucide-react";

export interface PersonalCategory {
  name: string;
  icon: LucideIcon;
  /** HSL color string (e.g. "210 80% 55%") — kept token-friendly */
  color: string;
  /** Optional id when the category is a user-created custom one. */
  id?: string;
  /** True when stored in the personal_expense_categories table. */
  custom?: boolean;
}

/** Icons available for both built-in and user-created categories. */
export const personalIconMap: Record<string, LucideIcon> = {
  Home, UtensilsCrossed, Car, HeartPulse, GraduationCap, Gamepad2,
  ShoppingBag, Receipt, CreditCard, Repeat, PawPrint, Gift, Package,
  Plane, Dumbbell, Music, Film, Book, Coffee, Wrench, Smartphone,
  Wifi, Zap, Droplet, Briefcase, Baby, Sparkles, Hammer, Heart, Fuel,
};

/** Curated palette (HSL token-friendly) for category creation. */
export const personalCategoryColors: string[] = [
  "210 80% 55%", "25 85% 55%", "200 70% 50%", "0 75% 60%",
  "260 70% 60%", "290 70% 60%", "330 75% 60%", "45 90% 55%",
  "230 70% 60%", "180 65% 50%", "30 75% 55%", "340 75% 65%",
  "150 65% 45%", "15 80% 55%", "270 60% 55%", "215 15% 55%",
];

export const personalCategories: PersonalCategory[] = [
  { name: "Moradia",         icon: Home,            color: "210 80% 55%" },
  { name: "Alimentação",     icon: UtensilsCrossed, color: "25 85% 55%" },
  { name: "Transporte",      icon: Car,             color: "200 70% 50%" },
  { name: "Combustível",     icon: Fuel,            color: "15 85% 50%" },
  { name: "Saúde",           icon: HeartPulse,      color: "0 75% 60%" },
  { name: "Educação",        icon: GraduationCap,   color: "260 70% 60%" },
  { name: "Lazer",           icon: Gamepad2,        color: "290 70% 60%" },
  { name: "Compras",         icon: ShoppingBag,     color: "330 75% 60%" },
  { name: "Contas",          icon: Receipt,         color: "45 90% 55%" },
  { name: "Cartão de Crédito", icon: CreditCard,    color: "230 70% 60%" },
  { name: "Assinaturas",     icon: Repeat,          color: "180 65% 50%" },
  { name: "Pets",            icon: PawPrint,        color: "30 75% 55%" },
  { name: "Presentes",       icon: Gift,            color: "340 75% 65%" },
  { name: "Outros",          icon: Package,         color: "215 15% 55%" },
].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

/** Resolve a category by name, optionally enriched with custom user categories. */
export const getPersonalCategory = (
  name: string,
  customs: PersonalCategory[] = [],
): PersonalCategory => {
  // Custom categories overrride built-ins with the same name (case-insensitive),
  // so editing a default category's color/icon reflects everywhere.
  const lowered = name.trim().toLowerCase();
  const custom = customs.find((c) => c.name.trim().toLowerCase() === lowered);
  if (custom) return custom;
  return (
    personalCategories.find((c) => c.name.trim().toLowerCase() === lowered) ??
    personalCategories[personalCategories.length - 1]
  );
};

/** Resolve a Lucide component from its string name (custom-category storage). */
export const resolvePersonalIcon = (iconName: string): LucideIcon =>
  personalIconMap[iconName] ?? Package;

/** Reverse lookup: find the string key in personalIconMap for a given Lucide component. */
export const getIconName = (icon: LucideIcon): string => {
  for (const [k, v] of Object.entries(personalIconMap)) {
    if (v === icon) return k;
  }
  return "Package";
};
