import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Search } from "lucide-react";

const BoletoSearchTab = lazy(() =>
  import("./BoletoSearchTab").then((m) => ({ default: m.BoletoSearchTab })),
);
const MyBoletosSection = lazy(() =>
  import("./MyBoletosSection").then((m) => ({ default: m.MyBoletosSection })),
);

interface Props { readOnly?: boolean }

export function BoletosTab({ readOnly }: Props) {
  return (
    <Tabs defaultValue="meus" className="w-full">
      <TabsList className="w-full grid grid-cols-2 h-auto p-1 gap-1 bg-muted/60 rounded-xl">
        <TabsTrigger
          value="meus"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="truncate">Meus boletos</span>
        </TabsTrigger>
        <TabsTrigger
          value="consultar"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Consultar</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="meus" className="mt-3">
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Carregando…</div>}>
          <MyBoletosSection readOnly={readOnly} />
        </Suspense>
      </TabsContent>
      <TabsContent value="consultar" className="mt-3">
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Carregando…</div>}>
          <BoletoSearchTab readOnly={readOnly} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
