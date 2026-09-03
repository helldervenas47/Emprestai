---
trigger: model_decision
---

# Revisão de Alterações Críticas

Considere uma alteração CRÍTICA quando envolver:

* banco de dados;
* Supabase;
* RLS;
* autenticação;
* pagamentos;
* Asaas;
* webhooks;
* empréstimos;
* juros;
* parcelas;
* faturas;
* saldos;
* patrimônio;
* metas financeiras;
* exclusão de dados;
* migrações;
* alterações de arquitetura.

Para alterações críticas:

1. NÃO implemente imediatamente.
2. Analise primeiro.
3. Explique a causa provável.
4. Liste os arquivos envolvidos.
5. Liste as tabelas envolvidas.
6. Liste as funções/RPCs/Edge Functions envolvidas.
7. Explique o impacto.
8. Proponha uma solução.
9. Aguarde aprovação do usuário quando houver risco de alteração de dados ou regras financeiras.

Após aprovação:

1. Faça a menor alteração possível.
2. Execute testes.
3. Analise o diff.
4. Procure regressões.
5. Apresente o resultado.
6. NÃO faça push sem autorização explícita.

Nunca faça alterações destrutivas para "testar" uma hipótese.
