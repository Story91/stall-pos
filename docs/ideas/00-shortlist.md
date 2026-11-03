# Shortlist: 8 pomysłów na PayPal AI Hackathon 2026

Kontekst (patrz `docs/research/`): 9 dni do deadline'u, jury ocenia 5 równych kryteriów (implementacja, design, impact, innowacja, prezentacja), a 177+ repozytoriów konkurencji skupia się na sporach, agentach zakupowych i guardrailach. Każdy pomysł poniżej celuje w **pustą niszę** z mapy konkurencji i ma jasno przypisane nagrody.

Zasada doboru: pomysł musi (1) nie istnieć w 50 przebadanych repo ani w blogowych "10 ideas", (2) dać się pokazać end-to-end w 3-minutowym wideo w sandboxie, (3) przewrócić domyślne założenie, które ma cała konkurencja.

## Tabela porównawcza

| # | Nazwa | Jedno zdanie | Przewrócone założenie | Główne nagrody | Sponsor | Ryzyko | Rozmiar |
|---|---|---|---|---|---|---|---|
| 1 | **HireHuman** | Agenci AI zatrudniają ludzi do mikrozadań i płacą im w sekundę przez PayPal Payouts | Wszyscy budują "agent kupuje od sklepu"; my: **agent kupuje od człowieka** | Best Use of Agentic Commerce, Most Creative, Grand | AG Grid, Render | średnie (dwie strony UI) | 7 dni |
| 2 | **Upstream** | Agent AI wycenia Twoje zależności open source i co miesiąc wypłaca maintainerom "tantiemy" z jednego abonamentu | Pieniądze w OSS płyną do fundacji; my: **automatycznie do konkretnych ludzi, proporcjonalnie do realnego użycia** | Most Impactful, Grand | AG Grid, Render, APIMatic | niskie | 5 dni |
| 3 | **Tanda** | AI prowadzi koła oszczędnościowe (ROSCA) dla nieubankowionych: zbiera składki, wypłaca kolejnym osobom, tłumaczy w każdym języku | Fintech dla nieubankowionych = pożyczka; my: **cyfryzacja 500-letniego mechanizmu zaufania, który już działa w 100+ krajach** | Most Impactful, Grand | Bryntum, AG Grid, Render | średnie (edukacja jury) | 6 dni |
| 4 | **Toll** | Bramka, która zamienia dowolny serwer MCP w płatne narzędzie: agent płaci agentowi per wywołanie na szynach PayPal | Monetyzacja agentów = krypto/x402; my: **ten sam efekt na PayPal, z fakturą i refundem** | Best Use of PayPal + AI, Agentic Commerce | APIMatic, Render, Postman | średnie (abstrakcyjny demo) | 5 dni |
| 5 | **Raincheck** | Wspólnota pracowników gig / ulicznych sprzedawców składa się na pulę; agent AI monitoruje pogodę i wypłaca automatycznie, gdy pada | Ochrona = polisa od ubezpieczyciela; my: **parametryczna kasa wzajemnej pomocy sterowana agentem** | Most Creative, Most Impactful | Bryntum, AG Grid, Render | wysokie (regulacje, wiarygodność) | 6 dni |
| 6 | **Understudy** | "Out-of-office" dla pieniędzy freelancera: agent z mandatem fakturuje, płaci podwykonawcom, zwraca zaliczki i pisze do klientów, gdy właściciel wypadł (szpital, poród, urlop) | Narzędzia dla freelancera zakładają, że jest przy klawiaturze; my: **agent działa, gdy go nie ma** | Best Use of PayPal + AI, Most Impactful | AG Grid, Render | średnie (zaufanie) | 6 dni |
| 7 | **Referee** | AI sędzia dla amatorskich turniejów: zbiera wpisowe, weryfikuje wyniki (API, zdjęcia), orzeka w sporach i wypłaca nagrody w minuty | Pula nagród = gotówka w kopercie i kłótnia; my: **agent, który rozstrzyga i płaci** | Best Demo Delivery, Agentic Commerce | Bryntum, AG Grid, Render | średnie (hazard: tylko turnieje umiejętności) | 6 dni |
| 8 | **Stall** | Głosowa kasa dla straganów i handlu nieformalnego: zdanie sprzedawcy → faktura PayPal z QR w 2 s, głosowe potwierdzenie, wieczorny raport, Payouts dla dostawców | POS = terminal i klikanie w menu; my: **głos w języku sprzedawcy + QR z faktury** | Most Impactful, Best Use of PayPal + AI | AG Grid, Render | niskie (ASR w hałasie) | 5 dni |

## Punktacja wg kryteriów jury (1–5, moja ocena)

| Kryterium | HireHuman | Upstream | Tanda | Toll | Raincheck | Understudy | Referee | Stall |
|---|---|---|---|---|---|---|---|---|
| Technological Implementation | 5 | 4 | 4 | 5 | 4 | 5 | 4 | 5 |
| Design (kompletny produkt) | 4 | 5 | 4 | 3 | 4 | 4 | 5 | 5 |
| Potential Impact | 4 | 5 | 5 | 3 | 4 | 5 | 3 | 5 |
| Innovation / Idea | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| Presentation (łatwość pokazania w 3 min) | 5 | 5 | 4 | 3 | 4 | 4 | 5 | 5 |
| **Suma** | **23** | **23** | 21 | 18 | 21 | **23** | 21 | **24** |
| Wykonalność w 9 dni (solo + Claude Code) | 4 | 5 | 4 | 4 | 3 | 4 | 4 | 5 |

## Rekomendacja

> **Korekta 3 XI (wieczór):** HireHuman ma bezpośredniego, dużego konkurenta: **RentAHuman** (YC S26, start luty 2026, REST + MCP, 500k+ zarejestrowanych ludzi). Jury zada pytanie "czym to się różni od RentAHuman", a odpowiedź "PayPal Payouts zamiast ich wypłat" nie wystarczy na "Innovation". **HireHuman spada z rekomendacji.** Aktualna rekomendacja: **Stall w wersji wzmocnionej na rynek USA** (patrz `08-stall.md`, sekcja "Wersja USA"). Pierwotna rekomendacja poniżej zostaje dla historii.

~~**Buduj HireHuman** (pomysł 1), a dashboard zadań zrób w AG Grid.~~

Dlaczego: to jedyny pomysł, który jednocześnie (a) jest dosłownie odwrotnością tego, co robi 7+ repozytoriów konkurencji, (b) wpisuje się słowo w słowo w kategorię "Best Use of Agentic Commerce" (agent, który *transakcjonuje*, nie rekomenduje), (c) daje wideo z naturalnym napięciem dramatycznym (agent utyka → człowiek dostaje zadanie na telefon → pieniądze lądują w PayPal w 10 sekund), (d) używa Payouts, których nie ma w Agent Toolkit, więc trzeba je opakować samemu jako narzędzie agenta, co jury odczyta jako "genuine, non-trivial implementation".

**Plan B: Upstream** (pomysł 2), jeśli wolisz niższe ryzyko i mocniejszy impact-story. Najprostszy do zbudowania, najłatwiejszy do pokazania, a historia "płacimy ludziom, których kod uruchamiasz" jest emocjonalna.

**Po dopisaniu pomysłów 6–8 (3 XI, druga tura):** **Stall** (8) wychodzi najwyżej w punktacji, bo łączy najgłębsze użycie Agent Toolkit (20 narzędzi Invoicing + QR) z najprostszą budową i najbardziej masowym odbiorcą. Jest mniej "kosmiczny" niż HireHuman, więc wybór sprowadza się do pytania: wolisz wygrać na **innowacji** (HireHuman) czy na **impakcie i wykonaniu** (Stall)? **Understudy** (6) to złoty środek: nowy koncept, emocjonalna historia, głęboki PayPal. **Referee** (7) daje najlepsze wideo ze wszystkich ośmiu, ale najsłabszy "real problem".

Szczegóły każdego pomysłu: `01-hirehuman.md` … `08-stall.md`.

## Odrzucone w drugiej turze

- **Sunsplit** (sąsiedzi rozliczają nadwyżki z paneli słonecznych przez Payouts): PayPal sam wymienia "solar co-op" w inspiracjach, więc będzie kilka kopii; wymaga symulowanych liczników.
- **Seed** (fundacja mikrograntów prowadzona przez AI: wnioski w czacie, ocena, Payouts, kamienie milowe): blisko amanah (treasury dla NGO) i Tandy.
- **Rematter** (AI wycenia używany sprzęt ze zdjęć, natychmiastowy Payout, odbiór): wymaga logistyki po stronie odbiorcy, w sandboxie wygląda jak mock.
- **Layaway** (plan ratalny bez kredytu dla osób bez historii kredytowej, przez Subscriptions): za blisko PayPal Pay Later, jury zapyta "po co, skoro mamy Pay Later".
- **Remittance agent na Xoom** (płacenie rachunków rodzinie w kraju pochodzenia): Xoom nie ma sandboxa.

## Odrzucone w trakcie (żebyś wiedział, co już przemyślałem)

- Agent negocjujący z agentem: zajęte (haggle, MateiS2002).
- Kieszonkowe dla dzieci za zadania (AI weryfikuje zdjęcie): fajne, ale nieletni nie mogą mieć PayPal; słaby "real audience".
- Asystent anulujący zombie-subskrypcje: wymaga API sprzedawców, w sandboxie wygląda sztucznie.
- Cokolwiek z PYUSD / x402 / AP2: brak w sandboxie, jury PayPal to wie.
- Copilot do sporów, agent zakupowy, escrow: po 4–8 kopii każdego.
