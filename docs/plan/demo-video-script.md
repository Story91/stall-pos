# Szablon skryptu wideo (2:40, kryterium "Presentation" + nagroda "Best Demo Delivery")

Jury może oceniać **wyłącznie** na podstawie wideo i opisu. Wideo to produkt.

## Struktura (sekundy)

| Czas | Sekcja | Co pokazać | Co powiedzieć |
|---|---|---|---|
| 0:00–0:15 | **Hook** | Jedno ujęcie z realnego świata (osoba, przedmiot, sytuacja) | Problem w jednym zdaniu z liczbą. Bez "Hi, I'm X and this is Y". |
| 0:15–0:30 | **Kto i dlaczego teraz** | Twarz / tekst na ekranie | Dla kogo, dlaczego dziś to boli, dlaczego agenci + PayPal to zmieniają |
| 0:30–1:50 | **Demo end-to-end** | Ekran, kursor, realne kliknięcia, bez cięć udających działanie | Narracja "co się dzieje", nie "co kliknąłem". **Musi być widać ruch pieniędzy w sandboxie** (saldo / transakcja). Pokaż AI *decydujące* (uzasadnienie na ekranie). |
| 1:50–2:15 | **Pod maską (15–25 s)** | Diagram architektury: agent → narzędzia → PayPal API (nazwy: Orders v2, Payouts, Webhooks) → AG Grid | Które API, dlaczego nietrywialne (np. "Payouts nie ma w Agent Toolkit, więc opakowaliśmy je jako narzędzie agenta z limitami") |
| 2:15–2:35 | **Impact + wizja** | Liczby, mapa, jedno zdanie o skali | "If this works for X, it works for Y" |
| 2:35–2:40 | **Zamknięcie** | Nazwa, repo, "built on PayPal sandbox" | Jedno zdanie |

## Zasady

- Nagrywaj w 1080p, 16:9, 30 fps; kursor powiększony; zoom na kluczowe elementy (saldo, odpowiedź AI).
- Głos: własny, spokojny, EN. Jeśli akcent przeszkadza, nagraj narrację osobno i dołóż napisy. Nie używaj AI-głosu bez ujawnienia.
- Bez muzyki, albo tylko własna/CC0 (regulamin).
- Każde 10 sekund bez zmiany na ekranie = cięcie.
- Pierwsza wersja w dniu 4 ujawni, co nie działa. Druga w dniu 7 jest finalna.
- Thumbnail YouTube: nazwa + jedno zdanie + zrzut ekranu.

## Checklista przed uploadem

- [ ] < 3:00
- [ ] Widać ruch pieniędzy w sandboxie
- [ ] Widać decyzję AI z uzasadnieniem
- [ ] Padają słowa: problem, dla kogo, PayPal (konkretne API), AI, sponsor tool
- [ ] Brak sekretów na ekranie (client secret, tokeny, prawdziwe e-maile)
