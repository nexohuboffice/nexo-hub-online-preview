# NEXO GAME AGENT · v0.1

**Estado:** protótipo de desenvolvimento; público e com dados financeiros 100% fictícios.

## O que funciona nesta versão

- Financial Center responsivo: receita **confirmada**, despesas, saldo líquido, pagamentos pendentes, coins virtuais, gráfico dos últimos 7 dias e meta.
- Tabela de eventos e exportação CSV **de demonstração**. A coluna DEMO_ONLY é sempre TRUE.
- Botão para alternar entre dados fictícios e painel vazio. Nada é guardado no servidor, nem em localStorage.
- Puzzle 6x6 com 3 mapas, obstáculos, objetivo e agente determinístico que observa o tabuleiro, calcula um caminho mínimo por BFS e move autonomamente até ao objetivo. Iniciar/pausar/repor/passo individual e contador de níveis.
- Navegação para este laboratório a partir do NEXO HUB público.

## O que esta versão NÃO faz

- Não existe Android Cloud, ligação a jogos comerciais, BestPlay, anúncios ou roleta.
- Não cria receitas nem prevê ganhos. Coins não são convertidas para EUR.
- Não corre em segundo plano; pausa se o navegador deixar de estar visível.
- Não processa dados financeiros reais nem liga à sessão privada GitHub.
- O botão "Portal privado" abre o gateway existente; ainda não existe ledger real nessa origem.

## Ficheiros

- index.html + app.css: interface demonstrativa.
- app.mjs: interações e ciclo do agente em browser.
- core.mjs: regras financeiras e motor BFS; sem dependências externas.
- core.test.mjs: testes Node.

## Testes

\`\`\`sh
node --test game-agent/core.test.mjs
\`\`\`

## Próximas fases (antes da cloud paga)

1. Revisão dos testes e do layout em desktop/Android.
2. Desenhar um ledger autenticado no gateway privado, com persistência em volume/database, validação no servidor, autorização por sessão e CSRF para operações de escrita.
3. Separar contas: pagamentos confirmados, saldo pendente, movimentos de moedas, custos reais e recibos. Sem taxas de conversão inventadas.
4. Extrair agente como worker isolado, com comandos start/stop, heartbeat, logs e limites de custo.
5. Avaliar Android Cloud somente para jogos cuja licença permita automação; nunca gerar visualizações publicitárias artificiais ou manipular sistemas de recompensas.

**Segurança:** todo o código deste diretório é servido publicamente via GitHub Pages. Nunca incluir tokens, sessões, pagamentos reais, chaves ou dados pessoais em código, CSV, URLs ou browser storage públicos.
