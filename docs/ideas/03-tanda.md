# 3. Tanda — koła oszczędnościowe (ROSCA) prowadzone przez agenta AI

> "1.4 billion adults are unbanked. Hundreds of millions of them already save money together in rotating circles. Tanda gives those circles an AI treasurer and PayPal rails."

## Problem

ROSCA (tanda w Meksyku, susu w Ghanie, chit w Indiach, hui w Chinach, stokvel w RPA, "kasa koleżeńska" w Polsce): 10 osób wpłaca co miesiąc $50, co miesiąc jedna osoba dostaje $500. Działa od wieków na zaufaniu, ale: ktoś musi zbierać gotówkę, pamiętać kolejkę, gonić spóźnialskich, a jedna osoba bez dostępu do gotówki rozwala koło. Fintechy (np. MoneyFellows, eMoneyPool) istnieją, ale są pojedynczymi aplikacjami lokalnymi; nikt nie zrobił tego jako agenta na PayPal, który rozmawia w języku każdego członka.

## Rozwiązanie

1. Organizator zakłada koło w czacie (WhatsApp-style UI lub web): "10 osób, $50 miesięcznie, start 1 grudnia".
2. **Agent AI** proponuje kolejkę wypłat (losowo lub wg potrzeby, z uzasadnieniem), tworzy harmonogram w **Bryntum Scheduler**, tłumaczy zasady każdemu członkowi w jego języku.
3. Każdy członek zakłada **PayPal Subscription** na składkę (sandbox), albo płaci **Orders v2** z linku, który agent wysyła.
4. Dzień wypłaty: agent sprawdza wpłaty (webhooki), i jeśli komplet, wysyła **Payout** do osoby z kolejki. Jeśli brak jednej składki: agent sam pisze do spóźnialskiego, proponuje rozwiązania (częściowa wypłata, przesunięcie), prowadzi głosowanie w kole.
5. Pełna księgowość w AG Grid, wyjaśnialne decyzje, eksport do PDF.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| Subscriptions (plan per koło) | składki miesięczne |
| Orders v2 | składka jednorazowa / nadpłata |
| **Payouts** | wypłata puli do członka z kolejki |
| Webhooks `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED` | agent reaguje na wpłaty/braki |
| Transaction Search | księga koła |
| Donations (opcjonalnie) | "fundusz awaryjny" koła |

## AI

- Projekt kolejki wypłat z uzasadnieniem (fairness, potrzeby zadeklarowane przez członków).
- Wielojęzyczny "skarbnik" w czacie (PL/ES/EN/HI...).
- Windykacja miękka: ton, czas, eskalacja; symulacja scenariuszy "co jeśli Ania nie zapłaci".
- Wykrywanie ryzyka (członek spóźnia się 2. raz) i propozycja zmiany kolejki.

## Partnerzy

- **Bryntum Scheduler/Calendar**: harmonogram rotacji, przeciąganie wypłat; AI przelicza skutki → spełnia warunek "AI as genuinely useful feature" dla nagrody Bryntum.
- **AG Grid**: księga koła.
- **Render**: hosting, cron (dzień wypłaty), Postgres.

## Demo wideo (3 min)

0:00 "Moja babcia prowadziła taką kasę w zeszycie przez 30 lat. To jest jej zeszyt." (zdjęcie)
0:15 Zakładamy koło na 5 osób w czacie; agent tłumaczy zasady po polsku, hiszpańsku i angielsku.
0:50 Harmonogram w Bryntum; członkowie subskrybują składkę (sandbox).
1:20 Symulujemy dzień wypłaty: 4/5 wpłat; agent pisze do piątej osoby, ta płaci, Payout leci do pierwszej osoby z kolejki, saldo rośnie.
2:10 Księga w AG Grid; pytanie "kto jest następny i ile brakuje?".
2:40 Wizja: 100+ krajów, zero nowych nawyków, PayPal jako warstwa zaufania.

## Ryzyka

- Jury może nie znać ROSCA → 15 sekund edukacji w wideo, liczby z Banku Światowego.
- Regulacje (pooling money) → produkt nie przechowuje środków: każdy payout wychodzi z konta organizatora dopiero po wpłatach; opisać w README.
- Mniej "wow" technologicznie niż HireHuman; wygrywa impactem.

## Zakres MVP (6 dni)

- D1: model koła, kolejka, Subscriptions/plan per koło.
- D2: webhooki, logika dnia wypłaty, Payouts.
- D3: czat-skarbnik (wielojęzyczny), windykacja.
- D4: Bryntum scheduler + AG Grid.
- D5: polish, symulator scenariuszy.
- D6: README, wideo.
