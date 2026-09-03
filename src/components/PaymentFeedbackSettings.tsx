import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Volume2, Smartphone, PartyPopper } from "lucide-react";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";

export function PaymentFeedbackSettings() {
  const { preferences, setPreferences, celebrate } = usePaymentCelebration();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Confirmação visual de pagamento
        </CardTitle>
        <CardDescription>
          Personalize a animação que aparece ao registrar parcelas, vendas e despesas pagas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Row
          icon={<Sparkles className="h-4 w-4 text-success" />}
          title="Animação de sucesso"
          description="Mostra um overlay com check, partículas e o valor pago."
          checked={preferences.enabled}
          onChange={(v) => setPreferences({ enabled: v })}
        />
        <Row
          icon={<PartyPopper className="h-4 w-4 text-warning" />}
          title="Confetti"
          description="Aumenta o número de partículas para um efeito mais celebratório."
          checked={preferences.confetti}
          onChange={(v) => setPreferences({ confetti: v })}
          disabled={!preferences.enabled}
        />
        <Row
          icon={<Volume2 className="h-4 w-4 text-primary" />}
          title="Som de sucesso"
          description="Toca um pequeno som agradável ao confirmar o pagamento."
          checked={preferences.sound}
          onChange={(v) => setPreferences({ sound: v })}
          disabled={!preferences.enabled}
        />
        <Row
          icon={<Smartphone className="h-4 w-4 text-primary" />}
          title="Vibração no celular"
          description="Em dispositivos compatíveis, vibra brevemente ao receber pagamento."
          checked={preferences.vibrate}
          onChange={(v) => setPreferences({ vibrate: v })}
          disabled={!preferences.enabled}
        />

        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              celebrate({
                kind: "loan",
                message: "Tudo pronto!",
                amount: 1234.56,
              })
            }
            disabled={!preferences.enabled}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Testar animação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <Label className={`text-sm font-medium ${disabled ? "text-muted-foreground" : "text-foreground"}`}>
            {title}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
