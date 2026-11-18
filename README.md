# Gráficos FX

Um app Android de gráficos parecido com o TradingView, com preços ao vivo da cTrader (Open API) ou da OANDA (v20).

## O que o app faz

- **Gráfico:** candles, candles vazados, Heikin Ashi, barras, linha e área. Timeframes de 1m até mensal. Ao rolar para a esquerda, carrega mais histórico.
- **Preço ao vivo:** consulta a OANDA a cada segundo. As barras diárias fecham às 17h de Nova York.
- **Scripts Pine (v5/v6):** cole um código do TradingView e ele roda no app. O motor é o PineTS. Funcionam:
  - `plot`, `plotshape`, `plotchar`, `hline`, `fill` e `bgcolor`
  - `line.new`, `box.new` e `label.new`
  - painel separado quando o script usa `overlay=false`
  - `request.security` com outros ativos e timeframes, usando dados da OANDA
  - entradas (`input.*`), editáveis em "Ajustes"
- **Desenhos:** linha de tendência, raio, linha estendida, linhas horizontal e vertical, raio horizontal, retângulo, Fibonacci, posição comprada e vendida (com pips e R:R), régua e texto. Têm ímã no OHLC e ficam salvos por ativo.
- **Replay de barras:**
  - escolha a barra inicial tocando no gráfico, ou vá direto para uma data
  - avance ou volte uma barra por vez
  - play/pause com velocidade de 0,5x a 10x
  - os indicadores, inclusive os de `request.security`, só enxergam o passado
- **Lista de ativos** com preço e variação do dia, busca por todos os instrumentos da sua conta, tema escuro e claro, e backup de desenhos e scripts.

## Velocidade

As barras ficam em cache no aparelho: ao trocar de ativo ou timeframe o gráfico aparece na hora e só o fim é atualizado. Em segundo plano o app pré-carrega os ativos da lista e os timeframes favoritos.

## Sincronizar entre aparelhos

⚙️ → Sincronizar: cole um token do GitHub com permissão **Gists: Read and write**. Desenhos, scripts, lista de ativos e ajustes ficam num Gist secreto; tokens das corretoras não são enviados.

## Yields (10 anos)

Na busca, categoria **Yields**: 10 anos de US, DE (EUR), GB, JP, AU, CA, CH e NZ, com dados intraday do site da CNBC (não oficial; pode parar se a CNBC mudar o site). Funcionam em `request.security("US10Y", "D", close)` (também aceita `TVC:US10Y`, `EU10Y`, `UK10Y`). Em ⚙️ → Testar yields dá para ver quais estão funcionando.

## Como gerar o APK (GitHub Actions)

1. Crie um repositório no GitHub e envie esta pasta para ele (branch `main`).
2. A cada envio, a aba **Actions** compila o app sozinha, em uns 5 minutos.
3. O APK aparece em **Releases** como `GraficosFX.apk`. Abra essa página no celular, baixe e instale. O Android vai pedir para permitir a instalação de "fontes desconhecidas".

O APK é sempre assinado com a mesma chave, que fica em `android/app/graficos-debug.keystore`. Por isso as versões novas instalam por cima da antiga sem apagar seus desenhos e scripts.

## Conectar a cTrader

1. Crie uma conta demo em ct.spotware.com.
2. Em openapi.ctrader.com → Applications, crie um app e espere ficar ativo.
3. Copie Client ID e Client Secret; no Playground, gere o Access token e o Refresh token.
4. No app: ⚙️ → Fonte de preços: cTrader → preencha → Conectar.

## Conectar a OANDA (só contas v20)

No app, vá em ⚙️ → Conta OANDA, cole o token da API e toque em **Conectar**. O token é criado no site da OANDA, em "Gerenciar acesso à API".

O token fica salvo só no celular. Nunca coloque o token no código nem no GitHub.

Sem token, o app funciona em modo demonstração, com preços simulados.

## Desenvolvimento

```bash
npm install
npm run dev        # abre no navegador (modo demonstração)
npm run sync       # monta o app e copia para o projeto Android
```

## Licenças

- Os gráficos usam o TradingView Lightweight Charts™ (Apache-2.0). O link de atribuição precisa continuar visível no gráfico.
- Os scripts Pine rodam com o PineTS (AGPL-3.0). Se você distribuir o app para outras pessoas, o código-fonte precisa estar disponível sob a mesma licença.
- O app não usa marca nem logo do TradingView.
