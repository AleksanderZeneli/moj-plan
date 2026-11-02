# Mój Plan

Mobilna aplikacja PWA do planowania zajęć WAT, wydarzeń prywatnych, zadań z deadline'ami i przygotowań na kolejne laboratoria. Repozytorium zawiera pierwszą wersję aplikacji bez płatnych usług.

## Co działa w v0.1

- Responsywny widok dnia i tygodnia.
- Ręczne dodawanie, edycja i usuwanie zajęć, wydarzeń i zadań.
- Wydarzenia tygodniowe; zadania mogą mieć deadline lub nie mieć daty.
- Przygotowania do laboratoriów: temat, notatki, data kolejnego labu, powtarzanie co tydzień.
- Pytanie **„Czy masz wszystko przygotowane?”** w aplikacji na 7 lub 3 dni przed laboratorium; potwierdzenie obowiązuje tylko dla najbliższego wystąpienia (w kolejnym tygodniu pojawi się ponownie).
- Prywatne dane w Supabase Auth + Postgres, chronione RLS.
- PWA możliwe do dodania na ekran główny iPhone'a.

## Czego jeszcze nie ma

- **Automatyczny import z WAT:** wymaga potwierdzenia kodu grupy i źródła danych (WATplan/WATcalendars). Nie wyświetlamy przykładowych zajęć jako oficjalnych.
- **Web Push przy zamkniętej aplikacji:** plik `sw.js` potrafi odebrać push, ale nie ma jeszcze serwera harmonogramującego wysyłkę ani rejestracji subskrypcji. Pytania o laboratorium w v0.1 są widoczne **w aplikacji**, nie na ekranie blokady.
- **Powiadomienia „przypięte”**: iOS nie umożliwia aplikacjom PWA trwałego przypinania zwykłych powiadomień.

## Supabase — uruchomienie danych w chmurze

1. Utwórz bezpłatny projekt na [Supabase](https://supabase.com/dashboard).
2. Otwórz **SQL Editor** i uruchom [supabase/schema.sql](supabase/schema.sql).
3. W **Authentication → Providers** upewnij się, że włączono logowanie przez e-mail.
4. Skopiuj z **Project Settings / API** adres URL projektu i klucz **publishable (lub anon)** do `config.js`.
5. **Nie umieszczaj w repozytorium klucza secret/service_role.** Klucz publishable/anon jest przeznaczony do przeglądarki, a prywatność zapewnia RLS.
6. W **Authentication → URL Configuration** ustaw docelowy adres aplikacji w `Site URL` i `Redirect URLs` (np. `https://AleksanderZeneli.github.io/moj-plan/`).

Gdy `config.js` jest pusty, aplikacja startuje w **trybie demo**. Dane demonstracyjne są trzymane tylko w pamięci bieżącej karty, nie w lokalnej bazie. Po odświeżeniu znikają. Po skonfigurowaniu Supabase logowanie i zapis w chmurze są obowiązkowe.

## Uruchomienie lokalne

To aplikacja statyczna (HTML/CSS/JS, bez instalacji paczek). Użyj lokalnego serwera HTTP, np. w VS Code z rozszerzeniem Live Server. Nie otwieraj przez `file://`, bo service worker i moduły ES wymagają serwera.

## GitHub Pages

W repozytorium: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**. Pamiętaj, że GitHub Pages z prywatnego repozytorium może wymagać odpowiedniego planu GitHub; alternatywnie kod aplikacji (bez sekretów) można opublikować w publicznym repozytorium. Prywatne dane użytkowników pozostają w Supabase z politykami RLS.

## Architektura

- `index.html`, `styles.css`, `app.js` — interfejs i logika.
- `config.js` — publiczne dane konfiguracyjne Supabase.
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA.
- `supabase/schema.sql` — tabele i polityki bezpieczeństwa.

## Dalszy plan

1. Podłączyć importer publicznych planów WCY dla wskazanego kodu grupy i odświeżanie danych.
2. Uruchomić usługę Web Push, przechowując subskrypcje powiązane z zalogowanym użytkownikiem.
3. Dodać powiadomienia o zmianach w planie i zbliżających się deadline'ach.
4. Dodać eksport danych i testy automatyczne.
# Oficjalny import rozkładu WCY

Importer `tools/import_wcy.py` pobiera stronę grupy bezpośrednio z
`https://planzajec.wcy.wat.edu.pl/pl/rozklad?grupa_id=WCY25KY2S1`.
Nie korzysta z usług innych aplikacji ani nie wymaga danych do e-Dziekanatu.

Uruchomienie ręczne: `python tools/import_wcy.py --group WCY25KY2S1`.
Weryfikacja pliku HTML pobranego ze strony WCY:
`python tools/import_wcy.py --html plan.html --group WCY25KY2S1`.
Testy: `python -m unittest discover -s tests`.

GitHub Actions (`.github/workflows/sync-wcy.yml`) próbuje synchronizować plan
dwa razy dziennie. Jeśli oficjalny serwer odrzuci żądanie 403, akcja zakończy
się błędem, a poprzedni poprawny JSON nie zostanie nadpisany. Publikacja zmian
JSON do hostingu Sites wymaga osobnego wdrożenia; sam commit na GitHub nie
aktualizuje automatycznie Sites. Wariant GitHub Pages może udostępniać JSON
bezpośrednio z repozytorium.

Walidator zachowuje poprzedni plik, gdy nowe dane nie obejmują bieżącego
semestru lub liczba zajęć spadnie o ponad 40%. Weryfikuje również identyfikator
grupy. Nie generuje nowych commitów, jeśli plan się nie zmienił. W takich
przypadkach wymagany jest ręczny przegląd, aby odróżnić prawdziwe odwołania
zajęć od uszkodzonej odpowiedzi. W odróżnieniu od PlanWAT importer nie ma
jeszcze mechanizmu wielokrotnego potwierdzania dużego spadku liczby zajęć.

Źródło inspiracji architektonicznej: projekt PlanWAT
(https://github.com/kilerdevs/PlanWAT, licencja MIT). Implementacja własna,
bez pobierania plików kalendarzy lub korzystania z usług PlanWAT.

