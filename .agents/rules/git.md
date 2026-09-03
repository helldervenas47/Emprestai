---
trigger: always_on
---

# Git, GitHub e Deploy — Emprestaii

## Git

O Git é a fonte de controle de versão do Emprestaii.

Nunca faça alterações destrutivas no histórico sem autorização explícita.

Nunca execute automaticamente:

* git reset --hard;
* git clean -fd;
* git push --force;
* git rebase destrutivo;
* exclusão de branches.

## Branch padrão

Todos os commits e pushes devem ser feitos na branch `fix/from-stable`.

Nunca faça commit diretamente na `main` sem autorização explícita.

## Commits

Um commit deve representar uma alteração coerente.

Evite misturar:

* correção de bug;
* refatoração;
* alteração visual;
* atualização de dependências;

no mesmo commit, salvo se forem diretamente relacionadas.

Antes do commit:

* verificar git diff;
* verificar git status;
* executar testes;
* verificar secrets;
* verificar arquivos inesperadamente modificados.

## Push

NUNCA execute push automaticamente.

O usuário deve autorizar explicitamente o push.

Antes de solicitar autorização:

* informe o commit;
* informe os arquivos alterados;
* informe os testes realizados;
* informe possíveis riscos.

## Deploy

Não considere que uma alteração local está em produção apenas porque o código foi alterado.

Após push:

* verifique o resultado do pipeline;
* verifique o deploy;
* verifique logs quando necessário;
* valide funcionalidades críticas.

Nunca execute migrations de produção automaticamente junto com um deploy sem autorização explícita.

## Rollback

Sempre que uma alteração tiver risco elevado, mantenha uma forma clara de rollback através do Git.

Não apague commits ou branches usados para recuperação sem autorização.
