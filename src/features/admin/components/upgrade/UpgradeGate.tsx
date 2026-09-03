import { useNavigate } from "react-router-dom";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UpgradeGateProps {
  feature: string;
  description?: string;
  benefits?: string[];
}

export function UpgradeGate({ feature, description, benefits }: UpgradeGateProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center py-16 px-4">
      <Card no3d className="max-w-lg w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{feature}</h2>
          <p className="text-muted-foreground">
            {description ||
              "Este recurso está disponível apenas nos planos pagos. Faça upgrade para desbloquear todas as funcionalidades."}
          </p>
          {benefits && benefits.length > 0 && (
            <ul className="text-sm text-left space-y-2 bg-muted/40 rounded-lg p-4">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <Button size="lg" onClick={() => navigate("/planos")} className="w-full">
            Ver planos <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
