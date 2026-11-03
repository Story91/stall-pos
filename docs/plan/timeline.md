# Harmonogram: 9 dni do 12 listopada 2026, 21:00 czasu warszawskiego

Deadline: **czw. 12 XI 2026, 12:00 PT = 21:00 Warszawa**. Celuj w wysłanie **11 XI wieczorem**, a 12 XI zostaw na poprawki i bufor na awarię Devpost/YouTube.

| Dzień | Data | Cel | Definition of done |
|---|---|---|---|
| 0 | wt 3 XI | Wybór pomysłu, design doc, sandbox | Pomysł wybrany; `docs/superpowers/specs/*-design.md` napisany; sandbox app + 3 konta testowe; `scripts/smoke-test.mjs` przechodzi |
| 1 | śr 4 XI | Szkielet + PayPal core | Repo na GitHub (public, MIT), CI zielone; token refresh, Orders v2 create/capture, Payouts batch działają z testami |
| 2 | czw 5 XI | Agent + narzędzia | Agent (Vercel AI SDK + Claude) wywołuje narzędzia PayPal i własne; webhooki z weryfikacją podpisu na Render |
| 3 | pt 6 XI | Główna pętla produktu | Pełny happy path end-to-end działa lokalnie i na Render |
| 4 | sob 7 XI | UI + AG Grid | Interfejs kompletny, dashboard AG Grid, "ask the grid"; pierwsza próba nagrania (wykrywa braki) |
| 5 | nd 8 XI | Edge cases + polish | Błędy, refundy, limity, puste stany, loading; testy; README draft |
| 6 | pon 9 XI | Treść zgłoszenia | README finalny, opis Devpost (EN), Postman collection, LICENSE widoczny, instrukcja dla jury z kontami sandbox |
| 7 | wt 10 XI | Wideo | Skrypt → nagranie → montaż → YouTube (public, bez muzyki z prawami) |
| 8 | śr 11 XI | **Submit** | Zgłoszenie wysłane; sprawdzone na drugim komputerze, że repo da się uruchomić z README w < 15 min |
| 9 | czw 12 XI | Bufor | Tylko poprawki krytyczne; nic nowego |

## Reguły pracy

1. Każdy dzień kończy się działającym demo (choćby brzydkim). Nigdy nie zostawiaj repo w stanie "nie uruchamia się".
2. Codziennie 10 minut: przejdź `submission-checklist.md`.
3. Dzień 4: nagraj surowe wideo. To, czego nie da się pokazać w 3 minuty, wyleci z zakresu.
4. Agent-sędzia (`.claude/agents/hackathon-judge.md`) ocenia projekt w dniu 5 i 7; popraw najniższe kryterium.
5. Skalowanie w dół jest OK, skalowanie w bok nie: żadnych nowych feature'ów po dniu 5.
