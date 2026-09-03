import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <h2>1. Responsável pelo Tratamento</h2>
        <p>
          O EmprestAI é o controlador dos dados pessoais coletados através do Serviço, responsável por
          determinar as finalidades e os meios de tratamento.
        </p>

        <h2>2. Dados Pessoais Coletados</h2>
        <p>Coletamos as seguintes categorias de dados pessoais:</p>
        <ul>
          <li><strong>Dados de cadastro:</strong> nome, e-mail, senha (criptografada);</li>
          <li><strong>Dados de uso:</strong> registros de empréstimos, clientes, parcelas e despesas inseridos por você;</li>
          <li><strong>Dados técnicos:</strong> endereço IP, tipo de dispositivo, navegador, dados de telemetria e uso;</li>
          <li><strong>Dados de suporte:</strong> mensagens enviadas ao suporte.</li>
        </ul>

        <h2>3. Finalidades do Tratamento</h2>
        <ul>
          <li><strong>Criação e manutenção da conta:</strong> para fornecer acesso ao Serviço (base legal: execução de contrato);</li>
          <li><strong>Prestação do Serviço:</strong> armazenamento e processamento dos dados inseridos (base legal: execução de contrato);</li>
          <li><strong>Segurança e prevenção a fraudes:</strong> monitoramento de atividades suspeitas (base legal: interesse legítimo);</li>
          <li><strong>Melhoria do produto:</strong> análise de uso agregada para aprimorar funcionalidades (base legal: interesse legítimo);</li>
          <li><strong>Suporte ao cliente:</strong> responder dúvidas e solicitações (base legal: execução de contrato);</li>
          <li><strong>Comunicações:</strong> envio de notificações sobre o Serviço e, com seu consentimento, comunicações de marketing (base legal: consentimento).</li>
        </ul>

        <h2>4. Compartilhamento de Dados</h2>
        <p>Seus dados podem ser compartilhados com:</p>
        <ul>
          <li><strong>Provedores de infraestrutura:</strong> serviços de hospedagem, banco de dados e análise necessários para operar o Serviço;</li>
          <li><strong>Asaas:</strong> para processamento de pagamentos (cartão, Pix e boleto), gestão de assinaturas recorrentes e emissão de faturas;</li>
          <li><strong>Assessores profissionais:</strong> consultores jurídicos e contábeis, quando necessário;</li>
          <li><strong>Autoridades públicas:</strong> quando exigido por lei ou ordem judicial.</li>
        </ul>

        <h2>5. Retenção de Dados</h2>
        <p>
          Seus dados são mantidos enquanto sua conta estiver ativa. Após o encerramento da conta, os dados
          são retidos por 30 dias para possibilitar exportação, após os quais são excluídos ou anonimizados.
          Dados necessários para cumprimento de obrigações legais podem ser retidos pelo período exigido
          por lei.
        </p>

        <h2>6. Seus Direitos</h2>
        <p>
          Conforme a Lei Geral de Proteção de Dados (LGPD), você tem direito a:
        </p>
        <ul>
          <li>Confirmação da existência de tratamento;</li>
          <li>Acesso aos seus dados pessoais;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li>Portabilidade dos dados;</li>
          <li>Eliminação dos dados tratados com consentimento;</li>
          <li>Informação sobre compartilhamento;</li>
          <li>Revogação do consentimento.</li>
        </ul>
        <p>
          Para exercer seus direitos, entre em contato conosco pelo Serviço. Responderemos em até 15 dias
          úteis.
        </p>

        <h2>7. Segurança</h2>
        <p>
          Adotamos medidas técnicas e organizacionais apropriadas para proteger seus dados, incluindo
          criptografia em trânsito e em repouso, controle de acesso baseado em função e backup automático.
        </p>

        <h2>8. Cookies</h2>
        <p>
          Utilizamos cookies essenciais para o funcionamento do Serviço (autenticação e sessão). Não
          utilizamos cookies de rastreamento ou marketing sem seu consentimento prévio.
        </p>

        <h2>9. Alterações</h2>
        <p>
          Esta política pode ser atualizada periodicamente. Notificaremos sobre alterações significativas
          por e-mail ou pelo Serviço.
        </p>

        <div className="mt-12 pt-6 border-t border-border/30">
          <p className="text-muted-foreground text-sm">
            Em caso de dúvidas sobre privacidade, entre em contato conosco pelo Serviço.
          </p>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
