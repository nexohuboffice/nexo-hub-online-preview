# NEXO HUB v0.8 — Gateway privado (candidato; NÃO publicado)

Esta pasta prepara um serviço **separado** para a ligação real do NEXO, mas **não está implementada no Railway**.

- Login Discord OAuth2 restrito ao ID imutável do proprietário.
- Cookie HttpOnly + Secure + SameSite e state de autenticação assinado.
- API **somente GET /api/status**, com verificação de saúde de 9 serviços HTTP, sempre via rede privada do Railway.
- Os 3 serviços cron são apresentados como *não monitorizados* (não como offline).
- Sem ações de missões, Gmail, APIs de IA, voz Live, escrita ou token no browser.
- O domínio GitHub Pages mantém apenas a demo e o snapshot público datado.
- **BLOQUEIO DE SEGURANÇA:** não ativar o proxy experimental de HTML público sob a origem autenticada antes da auditoria de XSS/CSP e de fixar um bundle versionado. Não dar permissões à aplicação pública.

## Antes de qualquer deployment

1. Rever código e autenticação OAuth2, sessões, origin, CSP, rate limiting e CSRF.
2. Escolher domínio HTTPS dedicado e definir variáveis **no Railway**: GATEWAY_PUBLIC_ORIGIN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_OWNER_ID, SESSION_SECRET (forte).
3. Registar redirect URI exato em Discord Developer Portal `https://GATEWAY/auth/callback`.
4. Testar login owner e non-owner e serviços com dados simulados e em staging.
5. Exigir aprovação explícita do proprietário antes de criar serviço pago ou publicar.

## Verificação local

Node.js 22+; `npm test` — 11 testes com rede/Discord simulados, 0 falhas. Não prova login real.
