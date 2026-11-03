# Submission checklist (Devpost, PayPal AI Hackathon 2026)

## Stage One (pass/fail): czy w ogóle przejdziemy

- [ ] Projekt **działa** (nie mockup). Jury może uruchomić z README lub z hosted URL.
- [ ] PayPal jest **centralny** (nie "dodatek"): pieniądze faktycznie się ruszają w sandboxie i to widać.
- [ ] Projekt jest nowy lub znacząco zaktualizowany po 1 X 2026 (opisać w zgłoszeniu).
- [ ] Używa AI w sposób nietrywialny (nie tylko chat-wrapper).

## Repozytorium

- [ ] Publiczne na GitHub.
- [ ] `LICENSE` (MIT) w katalogu głównym, wykrywany przez GitHub (widoczny w sekcji About). Sprawdź na stronie repo.
- [ ] README (EN): co to jest, problem, dla kogo, architektura (diagram), **które funkcje PayPal i które endpointy**, które AI, które narzędzia sponsorów, jak uruchomić w < 15 min, **konta sandbox dla jury** (login + hasło buyer/seller), zmienne środowiskowe, link do wideo i demo.
- [ ] `.env.example` kompletny; żadnych sekretów w historii gita.
- [ ] `npm install && npm run dev` działa na czystej maszynie (przetestuj na drugim komputerze / w czystym folderze).
- [ ] Testy przechodzą; CI (GitHub Actions) zielone.
- [ ] Sekcja "How we use PayPal" i "How we use AI" napisana tak, żeby **automatyczna ocena AI** (regulamin to dopuszcza) łatwo ją sparsowała.
- [ ] Sekcja "Sponsor tools used" (AG Grid, Render, ...) z linkami do konkretnych plików.
- [ ] Postman collection (opcjonalnie) w `/postman`.

## Demo

- [ ] Hosted URL (Render) działa, albo instrukcje lokalne + konta.
- [ ] Jeśli wymaga logowania: dane w README.
- [ ] Dostępne bezpłatnie do 15 XII 2026.

## Wideo

- [ ] **< 3:00** (celuj w 2:40).
- [ ] YouTube, **public** (nie unlisted? regulamin: "publicly visible" → public lub unlisted z linkiem; wybierz public dla bezpieczeństwa).
- [ ] Pokazuje projekt **działający end-to-end** na docelowym urządzeniu, w tym realny ruch pieniędzy w sandboxie (saldo przed/po lub lista transakcji).
- [ ] Mówi: jaki problem, dla kogo, dlaczego ważne (kryterium Presentation).
- [ ] Zero muzyki z prawami autorskimi, zero cudzych znaków towarowych poza PayPal (logo PayPal OK w kontekście integracji; nie używaj logotypów innych firm).
- [ ] Napisy EN (auto YouTube wystarczą, ale sprawdź).
- [ ] Link wklejony w formularzu Devpost.

## Formularz Devpost

- [ ] Tytuł i tagline (≤ 60 znaków, mówi co robi).
- [ ] Opis: Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next (standard Devpost) + wyraźna lista funkcji PayPal.
- [ ] "Built with": paypal, paypal-payouts, paypal-orders-api, ag-grid, render, typescript, nextjs, claude, vercel-ai-sdk, mcp...
- [ ] Link do repo, link do wideo, link do demo.
- [ ] Zaznaczone nagrody sponsorskie, o które się ubiegamy (AG Grid, Render, ...).
- [ ] Zdjęcia/screenshoty (min. 3, 16:9).
- [ ] Wysłane do **11 XI**, potwierdzenie e-mail zachowane.

## Po wysłaniu

- [ ] Nic nie zmieniać w zgłoszeniu po 12 XI 12:00 PT (repo może żyć dalej, ale tag `v1.0-hackathon` zamraża wersję ocenianą).
- [ ] Dołączyć do PayPal Discord i zapytać o wątpliwości przed deadlinem, nie po.
