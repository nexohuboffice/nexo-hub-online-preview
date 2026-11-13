# NEXO HUB v0.8 — gateway privado em preparação

**Decisão de 13/11/2026:** testar **localmente** primeiro. Manter tudo fora da produção até login e segurança validados. A app pública GitHub Pages não é alterada nesta fase.

## Duas possibilidades de identidade
- Candidato anterior: **Discord OAuth owner-only** (arquitetura histórica NEXO)
- Novo candidato local: **GitHub OAuth owner-only**, conta `nexohuboffice`, identidade numérica `353932686`, sem scopes `repo` nem `user:email`

A mudança para GitHub **não implica alterar** o login do CORE no Discord. Estas abordagens são independentes; não misturar tokens ou sessões.

## Testes locais — GitHub OAuth

O candidato GitHub foi desenvolvido e testado localmente num pacote anexo à conversa ChatGPT em 13/11/2026. **O código ainda não está commitado nesta branch.** Não atribuir os testes ao pequeno esqueleto do repositório.

- **17/17 testes simulados** passaram em Node 22, incluindo login permitido/recusado, escopos OAuth, anti-CSRF, expiração, logout, consulta GraphQL sem mutações e isolamento de segredos.
- Smoke test HTTP real no loopback: `GET /health` 200, `GET /api/status` 401 anónimo, `GET /api/session` 200/anónimo.
- **OAuth externo, token Railway real e navegador do utilizador não testados.**

Callback de desenvolvimento: `http://127.0.0.1:8788/auth/callback`, permitido para loopback GitHub. Domínio futuro de produção deverá ser HTTPS e usar callback exato `https://HOST/auth/callback`.

A autenticação pública `GitHub Pages` **não** deve receber o token Railway, OAuth Client Secret ou cookies privados. O Railway Project Token é uma credencial com potencial de escrita, mesmo que a aplicação só faça queries.

## Bloqueios antes de um deployment
1. Colocar e rever o código na branch dedicada.
2. Escolher login GitHub ou Discord para este gateway (sem mudar o CORE).
3. Auditar XSS/CSP, sessões persistentes, rate limiting e gestão de segredos.
4. Testar OAuth real e Railway read-only em staging.
5. Pedir autorização explícita antes de qualquer serviço/alteração de produção.

Referência de trabalho: [Issue #2](https://github.com/nexohuboffice/nexo-hub-online-preview/issues/2).
