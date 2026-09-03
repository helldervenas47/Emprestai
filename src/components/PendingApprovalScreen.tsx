import { Clock, LogOut, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useAppBranding } from "@/hooks/useAppBranding";
import { AppLogo } from "@/components/AppLogo";

export function PendingApprovalScreen({ rejected = false }: { rejected?: boolean }) {
  const { signOut } = useAuth();
  const { branding } = useAppBranding();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 pt-safe">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <AppLogo area="auth" alt={branding.brand_name} rounded />
          </div>

          {rejected ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-foreground">Cadastro rejeitado</h1>
                <p className="text-sm text-muted-foreground">
                  Seu cadastro não foi aprovado pelo administrador. Entre em contato para mais informações.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-foreground">Aguardando aprovação</h1>
                <p className="text-sm text-muted-foreground">
                  Seu cadastro foi recebido e está aguardando aprovação do administrador. Você receberá acesso assim que for aprovado.
                </p>
                <p className="text-xs text-muted-foreground pt-2">
                  Esta página atualiza automaticamente.
                </p>
              </div>
            </>
          )}

          <Button variant="outline" onClick={signOut} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
