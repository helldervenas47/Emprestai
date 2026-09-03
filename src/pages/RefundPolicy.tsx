import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { Button } from "@/components/ui/button";

const RefundPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/80 sticky top-0 z-50 pt-safe">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/planos")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <img src={logoIcon} alt="EmprestAI" className="h-8 w-8 rounded-xl" width={32} height={32} />
            <span className="text-lg font-bold text-foreground">EmprestAI</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 prose prose-sm dark:prose-invert max-w-none">
        <h1 className="text-3xl font-bold text-foreground mb-2">Política de Reembolso</h1>
        <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <h2>Garantia de 7 dias</h2>
        <p>
          Oferecemos uma garantia de reembolso de 7 dias. Se você não estiver satisfeito com o EmprestAI,
          pode solicitar o reembolso integral dentro de 7 dias a partir da data do seu pedido, sem
          necessidade de justificativa.
        </p>

        <h2>Como solicitar um reembolso</h2>
        <p>
          Os reembolsos são processados pelo nosso provedor de pagamentos, Asaas. Para solicitar
          um reembolso, entre em contato com nossa equipe de suporte pelo Serviço informando o
          e-mail usado na compra e o motivo do pedido.
        </p>

        <h2>Processamento</h2>
        <p>
          Após a aprovação, o reembolso será processado pelo Asaas e o valor será devolvido ao
          método de pagamento original (cartão, Pix ou boleto). O prazo para o crédito aparecer
          pode variar conforme o banco ou operadora do cartão.
        </p>

        <h2>Após o período de 7 dias</h2>
        <p>
          Após os 7 dias iniciais, reembolsos não são garantidos, mas avaliamos solicitações caso a caso.
          Você pode cancelar sua assinatura a qualquer momento, e o acesso continuará até o final do período
          já pago.
        </p>

        <div className="mt-12 pt-6 border-t border-border/30">
          <p className="text-muted-foreground text-sm">
            Em caso de dúvidas sobre reembolsos, entre em contato conosco pelo Serviço.
          </p>
        </div>
      </main>
    </div>
  );
};

export default RefundPolicy;
