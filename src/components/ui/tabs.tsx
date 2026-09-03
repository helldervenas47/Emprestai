import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsListVariant = "pill" | "underline";
type TabsListContextValue = { variant: TabsListVariant };
const TabsListContext = React.createContext<TabsListContextValue>({ variant: "pill" });

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /**
   * "pill" (default): fundo muted com pill ativa (comportamento legado).
   * "underline": estilo linha inferior animada, mais discreto.
   */
  variant?: TabsListVariant;
}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant = "pill", ...props }, ref) => (
    <TabsListContext.Provider value={{ variant }}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          variant === "pill"
            ? "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground"
            : "inline-flex h-11 items-center justify-start gap-1 border-b border-border/60 text-muted-foreground w-full",
          className,
        )}
        {...props}
      />
    </TabsListContext.Provider>
  ),
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const { variant } = React.useContext(TabsListContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation min-h-[40px] ripple-touch",
        variant === "pill"
          ? "rounded-sm px-3 py-2 transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          : "relative rounded-none px-4 py-2 -mb-px transition-colors duration-200 hover:text-foreground data-[state=active]:text-foreground after:absolute after:left-2 after:right-2 after:bottom-[-1px] after:h-[2px] after:rounded-full after:bg-primary after:origin-center after:scale-x-0 after:transition-transform after:duration-300 after:ease-out data-[state=active]:after:scale-x-100",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
