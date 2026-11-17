# NEXO HUB — AI Command Center

**App pública:** https://nexohuboffice.github.io/nexo-hub-online-preview/

**Gateway privado:** https://nexo-owner-gateway-production.up.railway.app/

## v0.8 — Estado verificado em 17 novembro 2026

A aplicação mantém as oito secções e o Voice Demo. O Dashboard público apresenta uma auditoria histórica sanitizada de 13/11/2026, em `status-snapshot.json`. Os cartões não representam monitorização em direto. A PR #4 identifica esse caráter histórico e elimina dados retidos após falhas de atualização.

O acesso ao estado atual faz-se por navegação para o gateway privado, com login GitHub restrito ao proprietário. Cookies e resultados autenticados permanecem nesse domínio; não são copiados para GitHub Pages.

### Gateway publicado

- Serviço Railway existente: `nexo-owner-gateway`, branch `feature/v08-owner-gateway`, commit fixado `ea592d4e651bcc9831e8d20d18cf1c5562e43984` na auditoria de 17/11.
- Login real do proprietário, consulta autenticada `/api/status` e bloqueio após logout confirmados nessa auditoria.
- O painel consulta oito endpoints internos fixos `GET /health`, apenas de leitura, com cache de até 20 segundos. Oito responderam durante a verificação.
- Três tarefas agendadas e um provisionador são explicitamente não sondados. A resposta HTTP não prova o funcionamento completo de um serviço.
- O Railway contém 13 serviços; o painel inclui 12, excluindo o próprio gateway.
- O estado dos deployments ainda não é consultado: os campos correspondentes permanecem `UNKNOWN`.

### Desenvolvimento pendente

A [PR #3](https://github.com/nexohuboffice/nexo-hub-online-preview/pull/3) permanece em rascunho. O seu head `a7540827fa2e2ce92378b8bdf15c0aeb10878523` contém preparação Railway OAuth posterior à versão publicada. Essa configuração não está ativa no gateway e ainda não alimenta os cartões com deployments. Não confundir o topo da branch com o commit fixado em produção.

Os 38 testes desse head passaram localmente com fornecedores simulados. A rejeição de uma segunda conta real, Android, microfone e áudio real não foram validados nessa auditoria. Voice Demo foi validado por texto.

Chat, agentes, Mission Control, COMMS, Memory, Automations e Voice continuam demonstrativos. Integrações futuras devem começar com contratos e dados sintéticos, autenticação e autorização no gateway privado, sem execução de missões ou envios. Voz real e novos custos requerem decisão explícita antes da ativação.

## Segurança e publicação

Este repositório é público: nunca publicar `.env`, API keys, tokens, segredos OAuth/Railway, bases de dados ou dados pessoais. Não copiar sessões para URLs ou localStorage, nem expor dados privados por CORS na app pública.

GitHub Pages é servido de `main`, pasta `/(root)`, no mesmo endereço. O gateway tem deployment separado; alterações em `main` não atualizam o commit fixado no Railway. Alterações do gateway exigem revisão e validação antes de deployment. CORE, Discord e Gmail não são alterados por esta integração de leitura.
