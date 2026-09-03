import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallbacks por módulo (Fase 4).
 * Cada aba principal tem um esqueleto coerente com o conteúdo real, para evitar
 * mudanças bruscas de altura durante o carregamento lazy do módulo.
 */
export type SkeletonTab =
  | "overview"
  | "dashboard"
  | "expenses"
  | "products"
  | "vehicles"
  | "clients"
  | "calendar"
  | "reports"
  | "system"
  | "generic";

function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

function RowsSkeleton({ count = 5, height = "h-20" }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} rounded-xl`} />
      ))}
    </div>
  );
}

export function TabSkeleton({ tab = "generic" }: { tab?: SkeletonTab | string }) {
  const content = (() => {
    switch (tab) {
      case "overview":
        return (
          <>
            <CardsSkeleton count={4} />
            <Skeleton className="h-64 rounded-xl" />
          </>
        );
      case "dashboard":
        return (
          <>
            <CardsSkeleton count={4} />
            <RowsSkeleton count={4} />
          </>
        );
      case "expenses":
        return (
          <>
            <CardsSkeleton count={2} />
            <RowsSkeleton count={6} height="h-16" />
          </>
        );
      case "products":
        return (
          <>
            <CardsSkeleton count={3} />
            <RowsSkeleton count={4} />
          </>
        );
      case "vehicles":
        return (
          <>
            <CardsSkeleton count={3} />
            <RowsSkeleton count={3} height="h-28" />
          </>
        );
      case "clients":
        return (
          <>
            <Skeleton className="h-12 rounded-xl" />
            <RowsSkeleton count={6} height="h-16" />
          </>
        );
      case "calendar":
        return <Skeleton className="h-[420px] rounded-xl" />;
      case "reports":
        return (
          <>
            <CardsSkeleton count={4} />
            <Skeleton className="h-72 rounded-xl" />
          </>
        );
      case "system":
        return <RowsSkeleton count={5} height="h-16" />;
      default:
        return <RowsSkeleton count={4} />;
    }
  })();

  return (
    <div className="space-y-4 animate-fade-in" data-testid={`tab-skeleton-${tab}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando conteúdo…</span>
      {content}
    </div>
  );
}

export default TabSkeleton;
