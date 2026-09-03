import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Link as LinkIcon, Plus, Power, Trash2, Users } from "lucide-react";
import { useInviteCodes } from "@/features/admin/hooks/useInviteCodes";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function InviteAndApprovalSettings() {
  const { user } = useAuth();
  const { codes, create, toggleActive, remove } = useInviteCodes();
  const [requireApproval, setRequireApproval] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Load require_approval
  useState(() => {
    (async () => {
      if (!user) return;
      const { data } = await (supabase as any)
        .from("account_settings")
        .select("require_approval")
        .eq("owner_id", user.id)
        .maybeSingle();
      setRequireApproval(!!data?.require_approval);
      setLoaded(true);
    })();
  });

  const toggleApproval = async (checked: boolean) => {
    if (!user) return;
    setRequireApproval(checked);
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: user.id, require_approval: checked }, { onConflict: "owner_id" });
    if (error) {
      setRequireApproval(!checked);
      toast.error("Erro ao salvar configuração");
    } else {
      toast.success(checked ? "Aprovação manual ativada" : "Aprovação manual desativada");
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    const result = await create({
      expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      maxUses: maxUses ? Number(maxUses) : null,
    });
    setCreating(false);
    if (result) {
      toast.success("Link de convite criado!");
      setExpiresInDays("");
      setMaxUses("");
    } else {
      toast.error("Erro ao criar convite");
    }
  };

  const getInviteUrl = (code: string) => `${window.location.origin}/cadastro?invite=${code}`;

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(getInviteUrl(code));
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Aprovação de novos usuários
          </CardTitle>
          <CardDescription>
            Quando ativado, novos cadastros vindos de links de convite ficam pendentes até sua aprovação manual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="require-approval" className="cursor-pointer">
              Exigir aprovação manual
            </Label>
            <Switch id="require-approval" checked={requireApproval} onCheckedChange={toggleApproval} disabled={!loaded} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> Links de convite
          </CardTitle>
          <CardDescription>
            Gere links únicos para que novos usuários se cadastrem vinculados à sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Expira em (dias)</Label>
              <Input type="number" min="1" placeholder="Nunca" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Máximo de usos</Label>
              <Input type="number" min="1" placeholder="Ilimitado" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Gerar novo link
          </Button>

          <div className="space-y-2 mt-2">
            {codes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum link de convite criado</p>
            ) : (
              codes.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const exhausted = c.max_uses != null && c.uses_count >= c.max_uses;
                return (
                  <div key={c.id} className="flex items-center gap-2 p-2 rounded-md border border-border/50 bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <code className="text-xs font-mono font-semibold">{c.code}</code>
                        {!c.active && <Badge variant="outline" className="text-[10px]">Desativado</Badge>}
                        {expired && <Badge variant="destructive" className="text-[10px]">Expirado</Badge>}
                        {exhausted && <Badge variant="destructive" className="text-[10px]">Esgotado</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Usos: {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""}
                        {c.expires_at && ` • expira ${new Date(c.expires_at).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar link" onClick={() => copyLink(c.code)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={c.active ? "Desativar" : "Ativar"} onClick={() => toggleActive(c.id, !c.active)}>
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => remove(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
