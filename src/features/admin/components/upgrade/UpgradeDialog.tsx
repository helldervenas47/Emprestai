import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  benefit?: string;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  title = "Recurso disponível em planos pagos",
  description = "Este recurso não está incluído no seu plano atual.",
  benefit,
}: UpgradeDialogProps) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center">{description}</p>
        {benefit && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground flex gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>{benefit}</span>
          </div>
        )}
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button onClick={() => navigate("/planos")}>Ver planos</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
