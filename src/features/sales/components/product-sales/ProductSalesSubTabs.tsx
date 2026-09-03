import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Boxes } from "lucide-react";
import { salesSubTabs } from "./productSalesUtils";

export function ProductSalesSubTabsList({ showStock }: { showStock: boolean }) {
  return (
    <TabsList className="w-full bg-muted/60 border border-border/50 rounded-xl p-1 grid grid-cols-2 gap-1 sm:flex sm:gap-1 h-auto">
      {salesSubTabs.map((tab) => (
        <TabsTrigger
          key={tab.type}
          value={tab.type as string}
          className="sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:!text-primary data-[state=active]:shadow-sm"
        >
          <tab.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tab.label}</span>
        </TabsTrigger>
      ))}
      <TabsTrigger
        value="extrato"
        className="sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:!text-primary data-[state=active]:shadow-sm"
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Extrato</span>
      </TabsTrigger>
      {showStock && (
        <TabsTrigger
          value="estoque"
          className="sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:!text-primary data-[state=active]:shadow-sm"
        >
          <Boxes className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Estoque</span>
        </TabsTrigger>
      )}
    </TabsList>
  );
}
