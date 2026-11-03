# 6. Understudy — "out-of-office" dla Twoich pieniędzy

> "When a freelancer breaks a leg, their invoices stop, their contractors go unpaid and their clients walk. Understudy is the AI that keeps the business alive until they're back."

## Problem

60+ milionów freelancerów i solo-founderów na świecie nie ma nikogo, kto przejmie finanse firmy, gdy oni wypadną na tydzień: szpital, poród, żałoba, wakacje bez laptopa. Faktury nie wychodzą, przypomnienia nie idą, podwykonawcy czekają, klienci dostają ciszę, subskrypcje się odnawiają. Pracownik etatowy ma zastępstwo; freelancer ma tylko siebie.

## Rozwiązanie

Agent AI z **mandatem**: freelancer raz definiuje reguły ("fakturuj wg zakończonych kamieni milowych w Notion/Trello", "płać Ani za korekty do $300/tyg.", "zwracaj zaliczki, jeśli nie dostarczę w 14 dni", "odpowiadaj klientom w moim tonie"), a potem włącza tryb **Understudy** jednym kliknięciem lub automatycznie (brak aktywności 72 h, kontakt awaryjny potwierdza).

W trybie Understudy agent:
1. Wystawia i wysyła **faktury** (Invoicing: create → send → remind), pilnuje terminów, księguje wpłaty.
2. Płaci podwykonawcom przez **Payouts** w granicach mandatu; wyższe kwoty eskaluje do kontaktu awaryjnego.
3. Wstrzymuje lub negocjuje terminy, pisze do klientów w tonie właściciela, proponuje **refund** zaliczek, gdy nie da się dowieźć (Payments v2 refund).
4. Reaguje na **spory** (list/get dispute) i zbiera dowody, ale nie akceptuje roszczeń bez człowieka.
5. Prowadzi dziennik decyzji z uzasadnieniami; po powrocie freelancer dostaje 1-stronicowe "co się działo", może cofnąć to, co odwracalne.

## Dlaczego nowe

Konkurencja buduje narzędzia *dla* freelancera, który jest przy klawiaturze (scope-lock, scopepay, trustlock). Nikt nie buduje narzędzia na moment, gdy go **nie ma**. "Agentic commerce" w najczystszej formie: agent działa *zamiast* człowieka, z twardym mandatem, i to widać w pieniądzach.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| **Invoicing v2** (20 narzędzi w Agent Toolkit: create, send, remind, record_payment, recurring series) | serce produktu |
| **Payouts** | podwykonawcy |
| Payments v2 refund | zwroty zaliczek |
| Disputes | triage, dowody |
| Subscriptions | plan Understudy ($9/mies.) i wykrywanie odnowień narzędzi freelancera |
| Transaction Search | raport "co się działo" |
| Webhooks | wpłaty za faktury → kolejne kroki |

## AI

- Parsowanie mandatu w języku naturalnym do reguł (z potwierdzeniem w tabeli).
- Pisanie w tonie właściciela (few-shot z jego maili).
- Ocena "czy to mieści się w mandacie" przed każdym ruchem pieniędzy + widoczne uzasadnienie.
- Symulator: "włącz Understudy na 7 dni w trybie dry-run" pokazuje, co by zrobił (świetne na wideo i na onboarding).

## Partnerzy

- **AG Grid**: dziennik decyzji i faktur (filtr: wykonane / eskalowane / cofnięte).
- **Render**: backend, cron (przypomnienia, wykrywanie nieobecności).
- Zapier (opcjonalnie): sygnał "kamień milowy zamknięty" z Trello/Notion.

## Demo wideo (3 min)

0:00 Gips na nodze, telefon z 14 nieodebranymi od klientów. "To ja, tydzień temu."
0:15 Włączam Understudy; mandat na ekranie (3 reguły).
0:35 Dry-run: agent pokazuje plan na 7 dni.
0:55 Live: webhook "kamień milowy zamknięty" → faktura wystawiona i wysłana (sandbox), klient płaci, wpłata zaksięgowana.
1:30 Ania dostaje Payout $120 za korekty; saldo rośnie; kwota $900 eskalowana do kontaktu awaryjnego (SMS/e-mail).
1:55 Klient prosi o zwrot zaliczki; agent liczy, zwraca, pisze w moim tonie.
2:15 Wracam: raport "co się działo" + AG Grid; cofam jedną decyzję.
2:40 "Każdy freelancer zasługuje na zastępstwo."

## Ryzyka

- Zaufanie: wideo musi pokazać twardy mandat, eskalacje i możliwość cofnięcia.
- Wykrywanie nieobecności może być creepy → domyślnie ręczne włączenie + kontakt awaryjny.
- Impact-story jest emocjonalny, ale trzeba jedną liczbę (np. "średni freelancer traci 2 300 USD za tydzień ciszy", do zweryfikowania lub własna ankieta).

## Zakres MVP (6 dni)

- D1: model mandatu, parser reguł, dziennik decyzji.
- D2: Invoicing (toolkit) + webhooki wpłat.
- D3: Payouts z limitami + eskalacje.
- D4: refundy, spory, ton właściciela, dry-run.
- D5: UI + AG Grid.
- D6: README, wideo.
