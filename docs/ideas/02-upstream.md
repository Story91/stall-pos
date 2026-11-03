# 2. Upstream — tantiemy dla open source wypłacane przez agenta

> "You run 1,200 open-source packages in production. Upstream pays the 30 people who actually keep them alive."

## Problem

Firmy uruchamiają tysiące pakietów OSS i nie płacą nikomu, bo *nie wiedzą komu, ile i jak*. GitHub Sponsors wymaga ręcznego wyboru, fundacje biorą cięcie, a "donate" ląduje u 3 najgłośniejszych projektów, podczas gdy `left-pad`-owy drobiazg utrzymuje jedna osoba w nocy. Wynik: wypalenie maintainerów, xz-style przejęcia porzuconych pakietów.

## Rozwiązanie

1. Podłącz repo (lub wklej `package-lock.json` / `requirements.txt`).
2. **Agent AI buduje "cap table" zależności**: drzewo, głębokość, krytyczność (czy pakiet jest w ścieżce runtime, ile importów, czy ma CVE, czy ma jednego maintainera, kiedy ostatni commit). Wagi są wyjaśnialne, edytowalne.
3. Agent odnajduje kanały płatności maintainerów (pole `funding` w package.json, `FUNDING.yml`, e-mail z metadanych) i klasyfikuje: PayPal e-mail → wypłacalny; GitHub Sponsors → link; brak → "napisz do niego" (agent generuje mail).
4. Firma ustawia **PayPal Subscription** "Upstream budget" (np. $200/mies.).
5. Co miesiąc agent generuje **PayPal Payouts batch** (do 15 000 pozycji w jednym wywołaniu!), z notką dla każdego odbiorcy ("Firma X używa Twojego pakietu Y w produkcji, dziękujemy"). Webhook potwierdza doręczenie.
6. Maintainer dostaje e-mail z PayPal, bez zakładania czegokolwiek.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| **Payouts v1** batch | wypłaty do N maintainerów w jednej transakcji |
| Subscriptions + Catalog Products | miesięczny budżet firmy |
| Webhooks `PAYMENT.PAYOUTS-ITEM.*` | status: SUCCEEDED / UNCLAIMED / FAILED → agent reaguje (ponowna próba, mail) |
| Transaction Search | historia wypłat, raport "kto dostał ile" |
| Invoicing (opcjonalnie) | faktura dla firmy za okres |

## AI

- Ocena krytyczności pakietu (model + heurystyki), uzasadnienie w jednym zdaniu per pakiet.
- Wykrycie "bus factor 1" i porzuconych pakietów → podbicie wagi + alert bezpieczeństwa.
- Generowanie spersonalizowanych notek w payout i maili do maintainerów bez PayPal.
- "Ask the cap table" nad AG Grid: "pokaż pakiety z jednym maintainerem, które dostały < $5".

## Partnerzy

- **AG Grid Enterprise (trial)**: cap table z grupowaniem, pivot, wykresem udziałów → mocny kandydat na sponsor prize (to jest *dokładnie* przypadek użycia grida).
- **Render**: hosting + cron (miesięczny batch) + Postgres.
- **APIMatic**: wygenerowany typowany klient Payouts (toolkit go nie ma) → tani ticket na $1,000.

## Demo wideo (3 min)

0:00 "To jest package-lock.json naszego produktu. 1 184 pakiety. Zgadnij, ilu ludziom zapłaciliśmy w zeszłym roku. Zero."
0:20 Wklejamy lock, agent buduje cap table na żywo (AG Grid wypełnia się, wagi, uzasadnienia).
1:00 Agent znajduje 31 maintainerów z PayPal, 12 z GitHub Sponsors, 40 bez niczego; pokazuje wygenerowany mail.
1:30 Klik "Fund $200/month" → PayPal Subscription (sandbox checkout).
1:50 "Run payout" → batch Payouts; webhooki wpadają na żywo; saldo sandbox Personal maintainera rośnie.
2:20 Raport: "Twoje $200 trafiło do 31 osób; 4 pakiety mają bus factor 1; oto ryzyko".
2:45 Wizja: każda firma ma CI; CI może co miesiąc automatycznie płacić ludziom, od których zależy.

## Ryzyka

- "Czy maintainerzy chcą PayPala?" → wielu ma, a dla reszty agent wysyła mail; w pitchu: "pierwszy krok, nie ostatni".
- Prawdziwe adresy e-mail z metadanych npm → w demo używamy fikcyjnych kont sandbox; w README jasno opisujemy opt-in.
- Impact-story mocny, ale "innowacja" średnia → mocny design i AG Grid muszą to nadrobić.

## Zakres MVP (5 dni)

- D1: parser lock → drzewo, metadane z npm registry, scoring.
- D2: Subscriptions + Payouts client + webhooki.
- D3: AG Grid cap table + "ask".
- D4: maile, raport, polish.
- D5: README, Postman, wideo.
