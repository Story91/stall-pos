# 8. Stall — głosowa kasa fiskalna dla handlu nieformalnego

> "Two billion people sell things without a cash register. Stall turns 'two kilos of tomatoes, eight' into a PayPal invoice with a QR code before the customer finishes reaching for their phone."

## Problem

Stragany, food trucki, fryzjerzy mobilni, hydraulicy, sprzedawcy na bazarach od Warszawy po Lagos: nie mają terminala, nie wystawiają rachunków, nie wiedzą, ile naprawdę zarobili w miesiącu, a klient coraz częściej nie ma gotówki. Terminale kosztują, aplikacje POS wymagają klikania w menu z 40 produktami brudnymi rękami. Jednocześnie 60% zatrudnienia na świecie to gospodarka nieformalna (ILO).

## Rozwiązanie

Aplikacja na telefon sprzedawcy, obsługiwana **głosem i w jego języku**:

1. Sprzedawca mówi: "dwa kilo pomidorów po cztery i pęczek koperku dwa". AI rozpoznaje pozycje, ceny, walutę, podatek (jeśli dotyczy) i tworzy **PayPal Invoice** w 2 sekundy.
2. Na ekranie pojawia się **kod QR** (`generate_invoice_qr_code` z Agent Toolkit); klient skanuje, płaci PayPalem lub kartą przez link PayPal (bez konta).
3. Webhook `INVOICING.INVOICE.PAID` → telefon mówi "zapłacone, 10 złotych". Gotówka? Sprzedawca mówi "gotówka" → `record_payment_for_invoice`.
4. Wieczorem agent: "Dziś 47 sprzedaży, 412 zł, pomidory 38%. Wtorki są o 30% słabsze. Koperek kończy się najszybciej." (`get_merchant_insights`, `list_transactions`).
5. Dostawcom płaci przez **Payouts** jednym zdaniem: "zapłać Markowi za skrzynki 150".
6. Na koniec miesiąca: zestawienie do księgowej / urzędu (Invoicing search + PDF).

## Dlaczego nowe

W 50 repo: jeden projekt głosowy (VoiceBridge, dostępność dla kupujących) i jeden "POS dla małych sklepów" w inspiracjach PayPala. Nikt nie robi **głosu po stronie sprzedawcy** na bazarze ani nie używa generowania QR z faktury jako POS-a. Wykorzystuje najgłębszą część Agent Toolkit (20 narzędzi Invoicing), więc "Technological Implementation" ma naturalną głębię.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| **Invoicing v2** (create, send, generate_invoice_qr_code, record_payment, search, recurring dla stałych klientów) | kasa |
| Webhooks `INVOICING.INVOICE.PAID` | potwierdzenie głosowe |
| **Payouts** | dostawcy, pomocnicy |
| Reporting / merchant insights | wieczorny raport |
| Catalog Products | katalog produktów sprzedawcy uczący się z mowy |
| Zettle (w regulaminie liczy się jako PayPal) | wspomnieć jako ścieżkę produkcyjną |

## AI

- ASR + rozumienie w dowolnym języku (polski, hindi, suahili, hiszpański), z gwarą i liczebnikami ("po cztery", "osiem pięćdziesiąt").
- Uczenie się katalogu i cen sprzedawcy (po 3 dniach podpowiada "pomidory jak zwykle, 4 zł?").
- Insighty w prostych zdaniach, mówione na głos.
- Wykrywanie błędów ("powiedziałeś 400 zł za pomidory, na pewno?").

## Partnerzy

- **AG Grid**: historia sprzedaży, produkty, dni; "ask the grid" głosem.
- **Render**: backend + webhook.
- Postman: kolekcja.

## Demo wideo (3 min)

0:00 Stragan, ręce w ziemi, klient z telefonem bez gotówki. "Codziennie 10 takich klientów odchodzi."
0:15 Sprzedawca mówi zamówienie po polsku; na ekranie faktura + QR w 2 s.
0:35 Klient skanuje, płaci (sandbox Personal); telefon mówi "zapłacone"; saldo rośnie.
1:00 Drugi klient po angielsku; trzeci płaci gotówką ("gotówka").
1:25 "Zapłać Markowi 150 za skrzynki" → Payout.
1:45 Wieczór: raport głosem + AG Grid.
2:15 Miesięczne zestawienie PDF dla księgowej.
2:40 "Jedna aplikacja, zero klikania, każdy język, każdy stragan."

## Ryzyka

- ASR w hałasie bazaru → demo w kontrolowanych warunkach + tryb "potwierdź na ekranie".
- Czy PayPal jest realny dla straganu w Polsce? → produkt jest globalny (USA, UK, Meksyk, Indie, Filipiny, Nigeria), a Zettle to produkcyjna ścieżka; w pitchu pokazać mapę.
- Mniej "kosmiczne" niż HireHuman; wygrywa prostotą, impactem i głębią użycia Invoicing.

## Wersja USA ("Stall na sterydach", kierunek wybrany 3 XI)

Bohater: **food truck / stoisko na farmers market w USA**, paragon $8–40, właściciel często imigrant (ok. 1/3 restauracji i food trucków w USA prowadzą imigranci), język hiszpański / wietnamski / koreański / angielski. Klienci coraz częściej bez gotówki; Venmo i PayPal już wiszą na naklejkach przy kasach, ale bez pozycji, podatku, napiwku i ewidencji.

Co dochodzi ponad wersję bazową:

1. **Podatek od sprzedaży per lokalizacja**: food truck jeździ między miastami, a w USA jest 11 000+ jurysdykcji podatkowych; agent bierze GPS i stawkę (API Avalara/TaxJar w trybie sandbox lub własna tabela stanów na demo) i dolicza do faktury. To jest ból, którego nie rozwiązuje naklejka z Venmo.
2. **Napiwek** na fakturze (pozycja "tip", AI proponuje 15/18/20%).
3. **Venmo jako metoda płatności** (Venmo należy do PayPala i liczy się w regulaminie): przycisk Venmo w JS SDK v6 dla płatności z QR, tam gdzie sandbox pozwala.
4. **Tryb wieczorny (autonomia)**: agent sam uzgadnia dzień, wypłaca pomocnikom i dostawcom przez **Payouts** (prep cook płacony tego samego dnia, nie w piątek), wystawia **faktury cykliczne** klientom hurtowym (restauracja biorąca produkty co tydzień), goni niezapłacone, proponuje zakupy na jutro i prognozę dnia (pogoda + historia). To jest część "agentic commerce": agent transakcjonuje bez polecenia.
5. **Ewidencja pod 1099-K / Schedule C**: eksport miesięczny, kategorie, który jest czytelny dla księgowego.
6. **"Dlaczego nie Zettle / Square"**: oba wymagają czytnika, menu i klikania; Stall to telefon, głos i język właściciela; obsługuje też tych, którzy nie mają konta firmowego ani terminala.

Pitch po angielsku, demo w dwóch językach (angielski + hiszpański), jeden wtręt po polsku jako dowód, że działa w każdym języku.

Nazwa robocza: Stall. Alternatywy do rozważenia: Tally, Booth, Counter.

## Zakres MVP (5 dni)

- D1: głos → pozycje (ASR + parser), katalog.
- D2: Invoicing + QR + webhook + głosowe potwierdzenie.
- D3: gotówka, Payouts, raport wieczorny.
- D4: UI mobilne (PWA), AG Grid.
- D5: README, wideo.
