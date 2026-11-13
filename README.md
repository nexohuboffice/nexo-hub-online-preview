# NEXO HUB — AI Command Center

**App pública:** https://nexohuboffice.github.io/nexo-hub-online-preview/

## v0.8 — Operations Preview (13 November 2026)

A app mantém as oito secções e o Voice Demo. O Dashboard agora inclui **NEXO Status**: um snapshot sanitizado de uma auditoria real ao Railway, guardado em `status-snapshot.json` com data/hora. **Não é monitorização em direto.**

- 9 serviços contínuos online na última verificação
- 3 tarefas cron com última execução concluída na última verificação
- O Chat, Mission Control, COMMS, Memory, Automations e Voice são demonstrações sem integrações privadas
- Sem segredos, OAuth cookies ou dados privados nesta app pública

**Segurança:** o backend autenticado não está publicado. Desenvolvimento e critérios no [issue #2](https://github.com/nexohuboffice/nexo-hub-online-preview/issues/2). Antes de existir um gateway privado aprovado, usar o [Control Center oficial](https://nexo-discord-production.up.railway.app/login) para operações reais.

Este repositório é público; não publicar `.env`, API keys, tokens Discord, segredos Railway, bases de dados ou dados pessoais.

## GitHub Pages

Servido de `main`, pasta `/(root)`. As atualizações desta branch são publicadas no mesmo link, sem novos ZIPs.

O trabalho do gateway deve ficar isolado e sujeito a revisão de segurança e aprovação explícita antes de deployment.
