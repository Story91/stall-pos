# 7. Referee — AI sędzia i pula nagród dla amatorskich turniejów

> "Every weekend, millions of amateur tournaments collect entry fees in cash and argue about who won. Referee collects, watches, decides and pays — in minutes."

## Problem

Ligi padla, kluby szachowe, turnieje FIFA/Street Fighter na LAN-ie, biegi osiedlowe, zawody wędkarskie: organizator zbiera wpisowe gotówką lub BLIK-iem, prowadzi tabelę w Excelu, rozstrzyga spory "na oko", a wypłata nagród trwa dni. Platformy e-sportowe (Challengermode, Battlefy) obsługują duże gry i duże ligi; amatorzy z 12 osobami nie mają nic.

## Rozwiązanie

1. Organizator tworzy turniej w czacie: dyscyplina, format, wpisowe, podział puli (np. 60/30/10), zasady weryfikacji.
2. Uczestnicy płacą wpisowe przez **Orders v2** (JS SDK v6, link lub QR); pula rośnie na żywo.
3. **AI Referee** prowadzi drabinkę, przyjmuje wyniki i **weryfikuje dowody**: zrzut ekranu wyniku (vision), zdjęcie tablicy, dane z publicznego API (chess.com, Lichess, Strava, Steam), nagranie. Przy sprzeczności wyników obu stron prosi o dodatkowy dowód i orzeka z uzasadnieniem; organizator może nadpisać.
4. Po finale **Payouts** wypłaca nagrody zwycięzcom w ciągu minut; organizator dostaje swoją prowizję; nieobecnym zwraca wpisowe (refund).
5. Protesty: tryb sporu z dowodami i decyzją AI + głosowanie uczestników; wszystko w dzienniku.

## Dlaczego nowe

Zero turniejowych projektów w 50 przebadanych repo. Łączy trzy rzeczy, których jury szuka: agent, który *rozstrzyga i transakcjonuje* (nie rekomenduje), pieniądze widocznie krążą w obie strony (wpisowe → pula → wypłaty → zwroty), i jest to **najlepszy możliwy materiał na wideo** (napięcie, zwycięzca, saldo rośnie). Celuje w "Best Demo Delivery".

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| Orders v2 + JS SDK v6 | wpisowe |
| **Payouts** (batch: 1., 2., 3. miejsce + organizator) | nagrody |
| Payments v2 refund | zwroty dla nieobecnych / odwołany turniej |
| Invoicing + QR | wpisowe na miejscu (skan QR przy stoliku) |
| Disputes | mapowanie protestów |
| Webhooks | wpłata → miejsce w drabince |
| Transaction Search | rozliczenie turnieju |

## AI

- Weryfikacja wyników z obrazu (vision) i z API; wykrywanie manipulacji (ten sam screenshot dwa razy, zły timestamp).
- Orzekanie w sporach z uzasadnieniem i poziomem pewności; eskalacja poniżej progu.
- Generowanie drabinki, harmonogramu i komunikatów ("Twój mecz za 10 min, stół 3").
- Podsumowanie turnieju i statystyki.

## Partnerzy

- **Bryntum Scheduler**: harmonogram meczów na stołach/kortach; AI przesuwa po walkowerach → spełnia warunek nagrody Bryntum.
- **AG Grid**: tabela, pula, wypłaty.
- **Render**: hosting + webhook.

## Demo wideo (3 min)

0:00 Nagranie z klubu: ktoś krzyczy "to ja wygrałem!". "Tak kończy się większość amatorskich turniejów."
0:15 Tworzę turniej szachowy na 8 osób, wpisowe $5, pula 60/30/10.
0:35 Gracze płacą (sandbox), pula rośnie na ekranie do $40.
0:55 Mecz z Lichess: Referee pobiera wynik z API; drugi mecz: screenshot → vision → wynik; trzeci: sprzeczne zgłoszenia → prośba o dowód → orzeczenie z uzasadnieniem.
1:50 Finał → Payouts: trzy salda rosną; organizator dostaje $4.
2:15 Harmonogram Bryntum + tabela AG Grid; "ile wypłaciliśmy w tym sezonie?"
2:40 "Od szachów w bibliotece po ligę padla: uczciwa pula, sędzia bez emocji, wypłata w minutę."

## Ryzyka

- Hazard: pozycjonować jako turnieje **umiejętności** z wpisowym (dozwolone w większości jurysdykcji), nigdy jako zakłady; zaznaczyć w README, że produkt nie obsługuje gier losowych ani zakładów na cudze mecze.
- Weryfikacja z obrazu bywa oszukiwalna → API tam, gdzie jest, obraz jako drugi stopień, człowiek jako trzeci.
- Zadbać, żeby demo nie wyglądało jak "zabawka" → klub sportowy / biblioteka / firmowa liga jako odbiorca.

## Zakres MVP (6 dni)

- D1: model turnieju, drabinka, Orders wpisowe + webhook.
- D2: zgłaszanie wyników, integracja Lichess API, vision.
- D3: spory, orzekanie, Payouts + refundy.
- D4: Bryntum scheduler + AG Grid.
- D5: UI, komunikaty, polish.
- D6: README, wideo.
