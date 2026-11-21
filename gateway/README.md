# NEXO HUB v0.8 — Gateway de login GitHub (candidato, não publicado)

## Objetivo

Login exclusivo de `nexohuboffice` **pelo ID numérico imutável**, sem permissões de acesso aos repositórios nem ao email. Autenticação e consulta de estado dos 12 serviços NEXO; nenhuma rota para criar missões, enviar emails, editar dados ou implementar deployments.

**Estado de 13/11/2026:** código local + testes simulados; não publicado; nenhuma conta GitHub OAuth App criada automaticamente; nenhum Railway token criado/recebido. A app pública [NEXO HUB](https://nexohuboffice.github.io/nexo-hub-online-preview/) mantém-se intacta e sem login privado. O candidato Discord anterior é outra abordagem e não é substituído por este trabalho.

## Testes sem segredos

```sh
cd gateway
node --test github-gateway.test.mjs
```

É necessário Node.js 22 ou superior. **17 testes automatizados com HTTP GitHub e Railway simulado**, cobrindo autenticação, expiração, escopos OAuth vazios, CSRF, revogação de sessão, consulta read-only e confidencialidade. Os resultados locais não validam ainda OAuth com a conta real, Railway real nem navegação visual no teu Windows.

## OAuth real em loopback local (apenas depois dos testes)

No GitHub, com sessão iniciada como `nexohuboffice`, abrir `https://github.com/settings/developers` → **OAuth Apps** → **New OAuth App**:

- Application name: `NEXO HUB Login`
- Homepage URL: `http://127.0.0.1:8788/`
- Authorization callback URL: `http://127.0.0.1:8788/auth/callback`
- Não selecionar permissões de `repo` ou `user:email`; a app pede **scope vazio** para consultar apenas o ID público de utilizador.
- Desativar correspondência por wildcard para callbacks (se surgir a opção).

Guarda `Client ID` e `Client Secret` **fora do chat e do repositório**. No Windows executa `gateway/run-local.ps1` no PowerShell e introduz o segredo no prompt privado. Nunca coles o segredo num site público. O script não guarda segredos em ficheiros. A chave permanece na memória/processo local até o servidor terminar.

**Importante:** `http://127.0.0.1` é uma exceção de desenvolvimento loopback suportada pelo GitHub, não é HTTPS público. O servidor só escuta em `127.0.0.1`. Para deployment remoto o gateway **rejeita HTTP não local** e requer HTTPS.

## Railway — passo separado, opcional

Sem token, o login pode ser testado, mas `/api/status` devolve HTTP 503 (não configurado). Depois de validar OAuth e rever segurança:

1. Criar manualmente **Project Token** dedicado a `NEXO HUB / production` nas definições do projeto Railway.
2. Definir `RAILWAY_PROJECT_TOKEN` apenas no backend, **nunca no GitHub Pages** ou no GitHub público.
3. O código usa apenas GraphQL `query NexoReadOnlyStatus` com `Project-Access-Token` e verifica os IDs de projeto/ambiente na resposta. Não contém mutations nem expõe o token.
4. No PC local, sem acesso ao DNS interno do Railway, as 8 sondagens internas ficam **não monitorizadas**, e os três cron também (não são marcados como online). O campo `deployment` reflete apenas o último deployment.
5. Em Railway, opcionalmente ativar `NEXO_PRIVATE_RAILWAY_HEALTH=1` para sondar os oito serviços HTTP via hostnames internos fixos. Isso não verifica as execuções cron.

**Atenção:** um Project Token do Railway pode ter privilégios de escrita independentemente de o código executar apenas leituras. Uma fuga do token não seria read-only. Configurar limites, rotação e segurança em staging antes do uso real.

## Limitações antes de produção

- Sessões e states apenas **em memória**: adequados para teste local com uma instância, não para múltiplas réplicas ou continuidade após reinício. Introduzir Redis/DB de sessão e proteção distribuída contra replay e rate limiting antes do deployment.
- Falta auditoria de segurança independente, logs de acesso minimizados, alertas, testes OAuth reais e recuperação de falhas no navegador.
- Não servir nem injetar HTML mutável do GitHub Pages na origem com cookies autenticados sem uma auditoria de XSS, CSP e bundle versionado.
- Não foi publicado serviço no Railway, nem autorizados novos custos. CORE, COMMS, Discord, Voice e missões existentes não sofreram alterações.


## Revisão de segurança adicional — 13/11/2026

O candidato valida agora o **Host** recebido no pedido contra o domínio configurado e rejeita caminhos absolutos/começados por `//`. Em HTTPS, a escuta TCP usa `0.0.0.0:$PORT` por trás do proxy Railway, mantendo fixa a origem pública para OAuth e cookies. Em loopback continua a escutar só em `127.0.0.1`. Esta configuração **não substitui** validação num proxy de produção real.

### Preferência atual: primeira leitura Live **sem Project Token**

Se for aprovado um gateway privado dentro do mesmo ambiente Railway, a opção `NEXO_PRIVATE_RAILWAY_HEALTH=1` sem `RAILWAY_PROJECT_TOKEN` permite sondar apenas os oito endpoints `/health` privados de endereços fixos `<nome>.railway.internal:8080`, sem configurar nenhum token de projeto. Os três serviços cron e o bootstrap IMMO permanecem `not_monitored` e o campo `deployment` aparece `UNKNOWN` porque o gateway **não consulta** a API Railway.

**Limites:** este modo não funciona como verificação da produção a partir do PC local (o domínio interno só é resolvido dentro da rede privada Railway). É necessário validar as portas e respostas dos serviços, verificar autenticação e endurecimento do domínio HTTPS, e obter aprovação para qualquer novo serviço/custo antes de publicar. Não fazer merge para main nem criar serviço Railway nesta fase.

### Provas executadas

`npm test` — **24 testes aprovados**, incluindo HTTP real em `127.0.0.1` sem quaisquer segredos reais. Os fornecedores GitHub/Railway foram simulados; o login OAuth real e os serviços privados de Railway **não foram ensaiados**.

### Confirmação da topologia Railway (somente leitura)

A fonte implantada de `immo-discord-bootstrap` confirma que é um provisionador **one-off**, sem servidor HTTP ou `/health`; portanto está em `NON_HTTP_SERVICES` e **não é sondado**. O serviço Docker `nexo-browser` declara `healthcheckPath=/health`. São **oito** serviços HTTP a sondar e **quatro** estados `not_monitored` (3 cron + 1 bootstrap). Esta auditoria não constitui uma sondagem real da rede privada.
