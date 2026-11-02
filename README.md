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

### Gdy automatyczne pobieranie zwraca 403, ale przeglądarka otwiera plan

PlanWAT dokumentuje ten sam problem dla WCY i również przewiduje użycie
HTML zapisanego w przeglądarce. Nie trzeba instalować Dockera ani uruchamiać
publicznego proxy:

1. Na komputerze otwórz oficjalny plan wybranej grupy, np.
   `https://planzajec.wcy.wat.edu.pl/pl/rozklad?grupa_id=WCY25KY2S1`.
2. Zapisz stronę jako **HTML only / Tylko HTML** (`Ctrl+S`). Jeśli zapisany
   plik nie zawiera ukrytych danych zajęć, naciśnij `F12`, otwórz konsolę,
   wykonaj `copy(document.documentElement.outerHTML)` i wklej wynik do
   pliku `plan.html` w edytorze tekstu (to wyłącznie zawartość planu).
3. W katalogu projektu uruchom
   `python tools/import_wcy.py --html plan.html --group WCY25KY2S1`.
4. Sprawdź wygenerowany `data/WCY25KY2S1.json`. Możesz dodać ten **publiczny
   plan zajęć** do repozytorium, aby aplikacja pobierała go przez GitHub Pages.
   Nie publikuj HTML zawierającego tokeny sesji, danych z e-Dziekanatu ani
   ciasteczek/logów przeglądarki. Wystarczy wynikowy plik JSON.

Ta metoda jest ręcznym importem aktualnej migawki, **nie zapewnia
automatycznych aktualizacji**. W przypadku bloku 403 nie próbujemy omijać
zabezpieczeń WAT rotacją niesprawdzonych serwerów proxy.

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

# Publikacja przez GitHub Pages

Plik `.github/workflows/pages.yml` buduje statyczny katalog `dist` i publikuje
go w GitHub Pages po każdym pushu do `main`. Skrypt kopiuje także wszystkie
istniejące `data/*.json`, dzięki czemu poprawnie zsynchronizowane rozkłady
mogą być publikowane wraz z aplikacją. Nie ma potrzeby tworzenia drugiego repo.

**Ważne:** prywatne repozytorium może wymagać GitHub Pro lub wyższego planu
do używania GitHub Pages. Na GitHub Free Pages działa dla publicznych repo.
Nie zmieniaj repo na publiczne, jeżeli znajdują się w nim prywatne pliki.
Po sprawdzeniu planu konta wejdź w GitHub → repo → Settings → Pages i jako
źródło wybierz **GitHub Actions**. Docelowy adres będzie miał postać
`https://aleksanderzeneli.github.io/moj-plan/` dopiero po udanym wdrożeniu.

# Logowanie i grupa

Własne konto, hasło i zapis grupy realizuje Supabase Auth oraz tabela
`profiles` z ograniczeniem RLS. Kod grupy użytkownik wpisuje po zalogowaniu
w **Ustawieniach**; nie ma już domyślnie przypisanej grupy dla wszystkich.
Zadania i notatki są chronione RLS i nie są zapisywane w lokalnej bazie PWA.

Aby uruchomić prawdziwe logowanie, załóż własny projekt Supabase, wykonaj
`supabase/schema.sql` w SQL Editor i wstaw **publiczne** wartości Project URL
oraz anon/publishable key jako zmienne repozytorium GitHub Actions
`SUPABASE_URL` i `SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions
→ Variables). Workflow zbuduje z nich publiczny `dist/config.js`, bez
umieszczania wartości w kodzie repozytorium. Nigdy nie umieszczaj tam `service_role`
ani kluczy secret. Dopóki konfiguracja jest pusta, działa tylko tryb DEMO,
bez prawdziwego logowania i bez trwałości danych.

Wpisanie dowolnej grupy w profilu nie oznacza jeszcze, że istnieje dla niej
plan JSON. Importer musi najpierw wygenerować dane tej konkretnej grupy;
przy blokadzie serwera WAT aplikacja pokazuje uczciwy komunikat o braku planu.

