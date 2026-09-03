import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMyProfilePhone } from "@/hooks/useMyProfilePhone";

export function ProfilePhoneCard() {
  const { phone, save, loading } = useMyProfilePhone();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(phone || ""); }, [phone]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(value.trim());
    setSaving(false);
    if (error) toast.error("Não foi possível salvar: " + error.message);
    else toast.success("Telefone salvo");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" /> Telefone (WhatsApp)
        </CardTitle>
        <CardDescription>
          Usado pelo botão “Enviar ao WhatsApp” nos resumos da aba Relatórios. Inclua DDD; se omitir o país, assumimos +55 (Brasil).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="profile-phone">Número</Label>
          <Input
            id="profile-phone"
            placeholder="Ex.: 11 99999-9999 ou +55 11 99999-9999"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            inputMode="tel"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading || saving || value === phone}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
