# Shortlist: 5 pomysłów na PayPal AI Hackathon 2026

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

## Punktacja wg kryteriów jury (1–5, moja ocena)

| Kryterium | HireHuman | Upstream | Tanda | Toll | Raincheck |
|---|---|---|---|---|---|
| Technological Implementation | 5 | 4 | 4 | 5 | 4 |
| Design (kompletny produkt) | 4 | 5 | 4 | 3 | 4 |
| Potential Impact | 4 | 5 | 5 | 3 | 4 |
| Innovation / Idea | 5 | 4 | 4 | 4 | 5 |
| Presentation (łatwość pokazania w 3 min) | 5 | 5 | 4 | 3 | 4 |
| **Suma** | **23** | **23** | 21 | 18 | 21 |
| Wykonalność w 9 dni (solo + Claude Code) | 4 | 5 | 4 | 4 | 3 |

## Rekomendacja

**Buduj HireHuman** (pomysł 1), a dashboard zadań zrób w AG Grid.

Dlaczego: to jedyny pomysł, który jednocześnie (a) jest dosłownie odwrotnością tego, co robi 7+ repozytoriów konkurencji, (b) wpisuje się słowo w słowo w kategorię "Best Use of Agentic Commerce" (agent, który *transakcjonuje*, nie rekomenduje), (c) daje wideo z naturalnym napięciem dramatycznym (agent utyka → człowiek dostaje zadanie na telefon → pieniądze lądują w PayPal w 10 sekund), (d) używa Payouts, których nie ma w Agent Toolkit, więc trzeba je opakować samemu jako narzędzie agenta, co jury odczyta jako "genuine, non-trivial implementation".

**Plan B: Upstream** (pomysł 2), jeśli wolisz niższe ryzyko i mocniejszy impact-story. Najprostszy do zbudowania, najłatwiejszy do pokazania, a historia "płacimy ludziom, których kod uruchamiasz" jest emocjonalna.

Szczegóły każdego pomysłu: `01-hirehuman.md` … `05-raincheck.md`.

## Odrzucone w trakcie (żebyś wiedział, co już przemyślałem)

- Agent negocjujący z agentem: zajęte (haggle, MateiS2002).
- Kieszonkowe dla dzieci za zadania (AI weryfikuje zdjęcie): fajne, ale nieletni nie mogą mieć PayPal; słaby "real audience".
- Asystent anulujący zombie-subskrypcje: wymaga API sprzedawców, w sandboxie wygląda sztucznie.
- Cokolwiek z PYUSD / x402 / AP2: brak w sandboxie, jury PayPal to wie.
- Copilot do sporów, agent zakupowy, escrow: po 4–8 kopii każdego.
