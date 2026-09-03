import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { Button } from "@/components/ui/button";

const Terms = () => {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <h2>1. Identificação do Fornecedor</h2>
        <p>
          Estes Termos de Uso são celebrados entre você ("Usuário") e <strong>EmprestAI</strong>,
          nome empresarial sob o qual opera a plataforma EmprestAI ("Empresa", "nós", "nosso").
          EmprestAI é o nome legal da entidade fornecedora do Serviço. Ao utilizar o Serviço,
          você está contratando diretamente com a EmprestAI.
        </p>

        <h2>2. Aceitação dos Termos</h2>
        <p>
          Ao acessar e utilizar a plataforma EmprestAI ("Serviço"), você concorda com estes Termos de Uso.
          O uso continuado do Serviço constitui aceitação integral destes termos. Caso não concorde, interrompa
          o uso imediatamente.
        </p>

        <h2>3. Sobre o Serviço</h2>
        <p>
          O EmprestAI é uma plataforma de gestão de empréstimos pessoais que permite cadastrar empréstimos,
          clientes, controlar parcelas, gerar relatórios financeiros e gerenciar cobranças. O Serviço é
          oferecido pela empresa EmprestAI.
        </p>

        <h2>4. Cadastro e Credenciais</h2>
        <p>
          Você é responsável por manter a confidencialidade de suas credenciais de acesso (e-mail e senha).
          Toda atividade realizada sob sua conta é de sua responsabilidade. Você deve fornecer informações
          precisas e mantê-las atualizadas.
        </p>

        <h2>5. Uso Permitido</h2>
        <p>Você se compromete a não utilizar o Serviço para:</p>
        <ul>
          <li>Atividades ilegais, fraudulentas ou spam;</li>
          <li>Violação de direitos de propriedade intelectual de terceiros;</li>
          <li>Interferência na segurança do sistema (malware, scraping, engenharia reversa);</li>
          <li>Redistribuição, revenda ou sublicenciamento do Serviço sem autorização.</li>
        </ul>

        <h2>6. Propriedade Intelectual</h2>
        <p>
          O EmprestAI retém todos os direitos de propriedade intelectual sobre o Serviço, incluindo software,
          documentação, marca e design. É concedida a você uma licença limitada, não exclusiva e
          intransferível para uso do Serviço dentro do plano contratado.
        </p>

        <h2>7. Conteúdo do Usuário</h2>
        <p>
          Você mantém a propriedade dos dados que insere no Serviço. Ao utilizá-lo, você concede ao
          EmprestAI uma licença limitada para hospedar e processar esses dados exclusivamente para a
          prestação do Serviço.
        </p>

        <h2>8. Pagamentos e Assinaturas</h2>
        <p>
          Nosso processo de cobrança é conduzido pelo nosso provedor de pagamentos Asaas. O Asaas
          processa pagamentos, gerencia assinaturas recorrentes, emite faturas e suporta múltiplos
          métodos (cartão de crédito, Pix e boleto bancário).
        </p>
        <p>
          Para mais detalhes sobre pagamentos, faturamento, impostos, cancelamentos e reembolsos,
          consulte os{" "}
          <a href="https://www.asaas.com/termos-de-uso" target="_blank" rel="noopener noreferrer">
            Termos de Uso do Asaas
          </a>{" "}
          ou entre em contato com nosso suporte.
        </p>

        <h2>9. Nível de Serviço</h2>
        <p>
          O EmprestAI se esforça para manter o Serviço disponível e funcional, mas não garante operação
          ininterrupta ou livre de erros. Manutenções programadas podem ocorrer.
        </p>

        <h2>10. Limitação de Responsabilidade</h2>
        <p>
          Na máxima extensão permitida por lei, o EmprestAI não será responsável por danos indiretos,
          consequenciais ou especiais (incluindo perda de lucros, dados ou reputação). A responsabilidade
          total está limitada ao valor pago nos últimos 12 meses.
        </p>

        <h2>11. Suspensão e Encerramento</h2>
        <p>
          O EmprestAI pode suspender ou encerrar seu acesso em caso de: violação material destes termos,
          inadimplência, risco de segurança/fraude ou violações repetidas das políticas. Ao encerrar sua
          conta, seus dados serão mantidos por 30 dias para exportação, após os quais serão excluídos.
        </p>

        <h2>12. Indenização</h2>
        <p>
          Você concorda em indenizar o EmprestAI contra reclamações decorrentes do uso indevido do Serviço,
          do conteúdo inserido ou da violação destes termos.
        </p>

        <h2>13. Legislação Aplicável</h2>
        <p>
          Estes termos são regidos pelas leis da República Federativa do Brasil. Eventuais disputas serão
          resolvidas no foro da comarca da sede do EmprestAI.
        </p>

        <h2>14. Alterações</h2>
        <p>
          O EmprestAI pode alterar estes termos a qualquer momento, notificando os usuários por e-mail ou
          pelo Serviço. O uso continuado após a notificação constitui aceitação das alterações.
        </p>

        <div className="mt-12 pt-6 border-t border-border/30">
          <p className="text-muted-foreground text-sm">
            Em caso de dúvidas, entre em contato conosco pelo Serviço.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Terms;
