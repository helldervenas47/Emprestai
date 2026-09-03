import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

export function HeroCardSkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary via-primary to-purple p-6">
      <SkeletonBlock className="h-3 w-24 bg-white/25" />
      <SkeletonBlock className="mt-3 h-10 w-48 bg-white/25" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-14 bg-white/20" />
        ))}
      </div>
    </div>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

export function CardBlockSkeleton({ className }: { className?: string }) {
  return <SkeletonBlock className={cn("h-64 rounded-2xl", className)} />;
}
