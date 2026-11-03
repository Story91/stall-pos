# 5. Raincheck — parametryczna kasa wzajemnej pomocy sterowana agentem

> "When it rains, 40,000 Warsaw couriers lose a day's income. Raincheck pays them before they're even home."

## Problem

Kurierzy, riderzy, uliczni sprzedawcy, ogrodnicy, fotografowie plenerowi: dochód zależy od pogody, a nikt im tego nie ubezpiecza (polisy są za drogie przy $20 dziennego dochodu, a roszczenia trwają tygodnie). Parametryczne ubezpieczenia (wypłata po przekroczeniu progu, bez roszczeń) istnieją dla rolników w Afryce, ale nie dla pracowników gig w miastach.

## Rozwiązanie (nie ubezpieczenie, lecz kasa wzajemnej pomocy)

1. Grupa (np. "kurierzy Mokotów") zakłada pulę; każdy członek płaci składkę przez **PayPal Subscription** (np. $3/tydzień).
2. **Agent AI** jest skarbnikiem: proponuje reguły wypłaty (próg opadów, wiatru, temperatury z publicznych API pogodowych; mapuje lokalizację członka), symuluje wypłacalność puli na danych historycznych i tłumaczy ryzyko w prostych słowach.
3. Zdarzenie: agent monitoruje pogodę (cron), gdy próg przekroczony dla danej strefy → **Payouts** do wszystkich dotkniętych członków automatycznie, bez roszczeń. Webhooki potwierdzają.
4. Transparentność: każda decyzja agenta ma zapis (dane pogodowe, reguła, lista wypłat); członkowie głosują nad zmianą reguł.
5. **Bryntum Calendar/Scheduler**: kalendarz pogody i wypłat; AG Grid: księga puli.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| Subscriptions | składki |
| **Payouts** (batch do wszystkich dotkniętych) | wypłaty parametryczne |
| Donations | "zasil pulę" dla sympatyków / pracodawców |
| Webhooks | wpłaty, wypłaty |
| Transaction Search | audyt |

## AI

- Projekt reguł i wycena składki (symulacja Monte Carlo na danych historycznych; model tłumaczy wyniki).
- Weryfikacja anomalii (członek "pracujący" 24/7 w 5 strefach).
- Komunikacja: "Dziś padało 14 mm w Twojej strefie, wypłaciliśmy Ci $12, pula ma jeszcze $840".

## Demo wideo (3 min)

0:00 Ujęcie deszczu za oknem + rider w deszczu. "Ten człowiek właśnie stracił $30."
0:20 Zakładamy pulę, agent proponuje reguły i składkę, pokazuje symulację.
1:00 Pięciu członków subskrybuje (sandbox).
1:20 Symulujemy burzę (mock API pogody) → agent wykrywa, generuje batch Payouts, saldo członka rośnie.
2:00 Kalendarz Bryntum + księga AG Grid; pytanie "ile wypłaciliśmy w listopadzie i czy pula przeżyje grudzień?".
2:40 Wizja: te same szyny dla upałów (robotnicy budowlani), smogu, powodzi.

## Ryzyka

- **Regulacyjne**: to pachnie ubezpieczeniem. Pozycjonować jako "mutual aid pool" (PayPal sam sugeruje "neighbors pool money"); nie gwarantujemy wypłat, pula dzieli to, co ma.
- Wiarygodność symulacji w 9 dni → proste modele, uczciwie opisane.
- Najwyższe ryzyko z piątki, ale też największy "wow" dla Most Creative.

## Zakres MVP (6 dni)

- D1: model puli, reguły, API pogody (Open-Meteo, darmowe, bez klucza).
- D2: Subscriptions, Donations, webhooki.
- D3: silnik zdarzeń + Payouts batch.
- D4: symulacja + wyjaśnienia AI.
- D5: Bryntum + AG Grid.
- D6: README, wideo.
