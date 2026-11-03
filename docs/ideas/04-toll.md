# 4. Toll — płatna bramka dla narzędzi MCP na szynach PayPal

> "Any MCP server becomes a paid API in one line. Agents pay agents. No tokens, no chains, just PayPal."

## Problem

Tysiące ludzi buduje serwery MCP (narzędzia dla agentów) i nie ma jak za nie pobierać opłat. Jedyne propozycje to krypto (x402, USDC) — niedostępne dla 99% deweloperów i firm. Po stronie kupującej: agent, który chce użyć cudzego narzędzia (np. "sprawdź VAT firmy", "wygeneruj render 3D"), nie ma portfela ani sposobu, żeby zapłacić per wywołanie z limitem.

## Rozwiązanie

`npx toll wrap ./my-mcp-server --price 0.05` → Toll staje proxy przed serwerem MCP.

1. **Sprzedawca** rejestruje narzędzie i cenę; Toll tworzy produkt w **PayPal Catalog** i plany (per-call z prepaid, albo **Subscription** z limitem wywołań).
2. **Kupujący agent** ma portfel Toll zasilany przez **Orders v2** (właściciel agenta doładowuje $20 przez PayPal Checkout, JS SDK v6). Portfel ma politykę: max per call, max per dzień, allowlista narzędzi.
3. Wywołanie narzędzia: agent → Toll → sprawdzenie polityki → wykonanie → obciążenie portfela → zapis. Co dzień/tydzień Toll rozlicza sprzedawców przez **Payouts** (z prowizją platformy jako "platform fee" story).
4. Spór/awaria narzędzia (timeout, błąd): automatyczny refund w portfelu + log; sprzedawca widzi reputację.
5. **AI**: agent-kupujący sam decyduje, czy warto zapłacić (porównuje cenę i reputację narzędzi); agent-sprzedawca ustala cenę dynamicznie (popyt, koszt tokenów); Toll generuje **PayPal Invoice** miesięczny dla firmy kupującej.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| Orders v2 + JS SDK v6 | doładowanie portfela agenta |
| Catalog + Subscriptions | plany sprzedawców |
| **Payouts** | wypłaty dla sprzedawców narzędzi |
| Invoicing | miesięczne rozliczenie B2B |
| Refunds (Payments v2) | zwroty za nieudane wywołania |
| Webhooks | statusy |
| Agent Toolkit | pokazujemy Toll oficjalnie obok PayPal MCP w Claude Desktop |

## Partnerzy

- **APIMatic**: Toll generuje dla każdego sprzedawcy dokumentację/SDK z OpenAPI → naturalne.
- **Postman**: kolekcja + MCP.
- **Render**: hosting proxy.
- AG Grid: panel rozliczeń.

## Demo wideo (3 min)

0:00 "Zbudowałem serwer MCP, który liczy ślad węglowy przesyłki. 2 000 agentów go używa. Zarobiłem $0."
0:20 `npx toll wrap` → cena $0.02/call; produkt pojawia się w PayPal.
0:45 W Claude Desktop agent kupujący pyta o ślad węglowy; Toll pokazuje "pay $0.02?" → polityka pozwala → odpowiedź.
1:20 Doładowanie portfela przez PayPal Checkout.
1:40 Wymuszamy błąd narzędzia → automatyczny refund.
2:00 Koniec dnia: Payouts do 3 sprzedawców, faktura dla kupującego.
2:40 Wizja: sklep z narzędziami dla agentów, gdzie każdy deweloper zarabia bez tokenów.

## Ryzyka

- Demo abstrakcyjne (agent płaci agentowi za dane) → potrzebny konkretny, wizualny use case (ślad węglowy, VAT, pogoda).
- Jury "Design": produkt developerski trudniej pokazać jako "complete product experience" → ładny panel sprzedawcy i kupującego.
- Mikropłatności per call nie przechodzą przez PayPal (opłaty) → model prepaid-wallet + rozliczenie batch; opisać jasno.

## Zakres MVP (5 dni)

- D1: proxy MCP, rejestr narzędzi, polityka portfela.
- D2: Orders (doładowanie), ledger, refundy.
- D3: Payouts, Invoicing, webhooki.
- D4: panele, APIMatic/Postman.
- D5: README, wideo.
