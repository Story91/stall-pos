# 1. HireHuman — agent-to-human commerce

> "Every hackathon project lets an AI agent buy from a store. HireHuman lets an AI agent hire a person."

## Problem (dla jury: real problem, real audience)

Agenci AI utykają na zadaniach, których nie da się zrobić z poziomu API: sprawdzić, czy sklep jest naprawdę otwarty, zrobić zdjęcie uszkodzonej paczki, przetłumaczyć zdanie w dialekcie, ocenić, czy mieszkanie na zdjęciach wygląda jak w ogłoszeniu, zadzwonić i spytać. Dziś agent albo halucynuje, albo przerywa i czeka na właściciela. Po drugiej stronie są miliony ludzi, którzy chętnie zrobią 2-minutowe zadanie za 2 dolary, ale platformy gig wypłacają po tygodniu i biorą 20–40%.

## Rozwiązanie

Serwer MCP + SDK z jednym narzędziem: `hire_human({ task, proof_required, max_price, deadline })`.

1. Agent (dowolny: Claude, GPT, własny) wywołuje `hire_human`. Nasz backend wycenia zadanie (AI), publikuje je w aplikacji mobilnej/web dla ludzi.
2. Człowiek przyjmuje zadanie, wykonuje, przesyła dowód (zdjęcie, tekst, nagranie).
3. **AI weryfikuje dowód** względem `proof_required` (vision model: "czy na zdjęciu widać otwarte drzwi sklepu z godzinami otwarcia?").
4. Po akceptacji **PayPal Payouts** wypłaca pieniądze w ciągu sekund na e-mail/telefon człowieka. Agent dostaje wynik zadania jako zwrot z narzędzia.
5. Zleceniodawca agenta ma **PayPal Subscriptions** (prepaid budżet / plan) lub płaci per zadanie przez Orders v2; agent ma limit wydatków per zadanie i per dzień.

## Dlaczego to "agentic commerce" w rozumieniu PayPal

PayPal w inspiracjach pisze: "a scheduling assistant that pays contractors automatically when a job is marked complete". To jest dokładnie to, ale uogólnione i z AI po obu stronach: AI zleca, AI weryfikuje, PayPal rozlicza. Agent *transakcjonuje*, nie rekomenduje.

## Funkcje PayPal

| Funkcja | Rola |
|---|---|
| **Payouts v1** (batch, EMAIL/PHONE/Venmo) | wypłata dla człowieka natychmiast po weryfikacji; brak w Agent Toolkit → własny tool `paypal_payout` |
| Orders v2 (+ JS SDK v6) | zleceniodawca doładowuje budżet agenta |
| Subscriptions | plan miesięczny "Agent Workforce" z limitem zadań |
| Webhooks (`PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`) | aktualizacja statusu, powiadomienie agenta |
| Transaction Search | dashboard kosztów per agent |
| Agent Toolkit / MCP | pokazujemy, że nasz serwer MCP działa obok oficjalnego PayPal MCP w Claude Desktop |

## AI

- Wycena zadania i rozbicie na kroki (Claude).
- **Weryfikacja dowodu** (Claude vision): zwraca `{ accepted, confidence, reason }`; poniżej progu → eskalacja do właściciela agenta.
- Wykrywanie nadużyć: duplikaty zdjęć, zadania niezgodne z polityką (nic nielegalnego, nic z CAPTCHA, nic z logowaniem na cudze konta).
- "Ask the ledger": pytania w naturalnym języku do tabeli AG Grid.

## Partnerzy

- **AG Grid**: ledger zadań i wypłat (filtrowanie, grupowanie per agent, wykresy kosztów) → sponsor prize.
- **Render**: backend + Postgres + webhook URL.
- Postman: publiczna kolekcja `hire_human` API.

## Demo wideo (3 min)

0:00 Hook: "Agent AI chce kupić używany rower z ogłoszenia, ale nie wie, czy rower istnieje." 
0:20 Agent w Claude Desktop wywołuje `hire_human("Sprawdź, czy rower z ogłoszenia X jest dostępny, zrób zdjęcie", max $3).
0:40 Telefon "pracownika" piszczy, przyjmuje zadanie, wysyła zdjęcie.
1:10 AI weryfikuje dowód, pokazujemy uzasadnienie.
1:30 **Sandbox PayPal: wypłata ląduje na koncie Personal** (pokazujemy saldo przed/po).
1:50 Agent kontynuuje i finalizuje zakup (Orders v2) — pełne koło.
2:20 Dashboard AG Grid: 40 zadań, koszty, czasy; "ile wydałem na weryfikacje w tym tygodniu?"
2:45 Wizja: każdy agent dostaje ręce i oczy; każdy człowiek dostaje natychmiastowy przychód bez prowizji platformy.

## Ryzyka i odpowiedzi

- *"To Mechanical Turk."* → MTurk: człowiek zleca, płatność po tygodniach, 20% prowizji, brak AI-QA. Tu: agent zleca autonomicznie, płatność w sekundy, AI ocenia dowód.
- Dwie strony UI → worker UI to prosta PWA (lista zadań, kamera, "wyślij"). Zleceniodawca to Claude Desktop + dashboard.
- Bezpieczeństwo: twarda lista zadań zabronionych, limity wydatków, human-in-the-loop przy niskiej pewności.

## Zakres MVP (7 dni)

- D1–2: backend (Next.js API lub Hono na Render), Postgres, Payouts client, token refresh, webhook z weryfikacją podpisu.
- D3: serwer MCP `hire_human` + wycena + polityka.
- D4: worker PWA (lista, akceptacja, upload dowodu).
- D5: weryfikacja AI (vision), eskalacja, Orders v2 doładowanie.
- D6: dashboard AG Grid + "ask the ledger".
- D7: polish, README, Postman, nagranie wideo.
