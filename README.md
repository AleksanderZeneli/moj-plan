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

- Synchronizacja WCY próbuje źródła uczelni, a przy blokadzie używa publicznego kalendarza PlanWAT. Starsze lub podejrzanie pomniejszone dane nie zastępują migawki.
- **Web Push przy zamkniętej aplikacji:** kod rejestracji telefonu, bezpieczny nadawca Supabase Edge Function i harmonogram GitHub Actions są w repozytorium. Działanie na ekranie blokady wymaga jednorazowego wdrożenia funkcji i skonfigurowania kluczy VAPID — poniżej instrukcja. Do tego czasu pytania o przygotowania są widoczne w aplikacji.
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

Kalendarz oferuje widok **Cały tydzień** (poniedziałek–niedziela na osi godzin)
oraz **Dzień**. Na telefonie cały tydzień mieści się na szerokości ekranu
jako siedem wierszy z podglądem godzin i zajęć; dotknij dnia, aby zobaczyć
szczegółowy plan. Nie trzeba przewijać osobnego kalendarza w poziomie i pionie.
Nakładające się wydarzenia są wyświetlane obok siebie; deadline'y pozostają na liście zadań.

Testy interfejsu i obsługi kont (bez instalacji paczek):
`node --test tests/app.test.cjs`.
Testy te używają atrap usługi kont; nie zastępują sprawdzenia RLS na dwóch
rzeczywistych kontach po skonfigurowaniu Supabase.

To aplikacja statyczna (HTML/CSS/JS, bez instalacji paczek). Użyj lokalnego serwera HTTP, np. w VS Code z rozszerzeniem Live Server. Nie otwieraj przez `file://`, bo service worker i moduły ES wymagają serwera.

## GitHub Pages

W repozytorium: **Settings → Pages → Build and deployment → GitHub Actions**. Workflow publikuje zmiany aplikacji z `main`. Prywatne dane użytkowników pozostają w Supabase z politykami RLS.

## Architektura

- `index.html`, `styles.css`, `app.js` — interfejs i logika.
- `config.js` — publiczne dane konfiguracyjne Supabase i Web Push.
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA.
- `supabase/schema.sql` — tabele i polityki bezpieczeństwa.
- `supabase/functions/send-reminders/` — chroniona funkcja wysyłająca przypomnienia Web Push.

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

GitHub Actions (`.github/workflows/sync-wcy.yml`) próbuje synchronizować grupę
WCY25KY2S1 co dwie godziny; ręczne uruchomienie pozwala podać inną grupę.
`tools/sync_timetable.py` najpierw czyta WCY, a przy blokadzie lub błędnych danych
sięga do `https://kilerdevs.github.io/PlanWAT/<GRUPA>/plan.ics`.
Kalendarz PlanWAT jest źródłem nieoficjalnym, jawnie oznaczonym w aplikacji.
Nie jest przyjmowany, jeśli jego data wygenerowania poprzedza obecną migawkę.
Gdy plan się zmieni, workflow zapisuje JSON i wywołuje publikację Pages.
Otwarte okno aplikacji sprawdza JSON co 30 minut oraz po powrocie do aplikacji
(jeśli od ostatniego sprawdzenia minęło 30 minut). To nie jest transmisja na żywo;
GitHub może opóźniać zadania harmonogramu, a źródła mogą udostępniać stare dane.
W razie błędów poprzedni JSON pozostaje. Przycisk w ustawieniach sprawdza
opublikowany plik, nie uruchamia crawla uczelni.

Publiczny feed: [PlanWAT](https://github.com/kilerdevs/PlanWAT), projekt kilerdevs
na licencji [MIT](https://github.com/kilerdevs/PlanWAT/blob/master/LICENSE).
Parser iCalendar jest własną implementacją; nie skopiowano kodu projektu.

## Przygotowanie do zajęć z planu

Laboratoria i ćwiczenia są rozpoznawane z pola rodzaju zajęć. Aplikacja pyta
o przyszłe terminy od dzisiaj przez najbliższe siedem dni w strefie Europe/Warsaw.
Odpowiedź „tak/nie” i notatka dotyczą konkretnego przedmiotu, rodzaju, daty,
godziny oraz grupy. Zmiana sali lub identyfikatora źródłowego zachowuje odpowiedź.
Przesunięcie terminu powoduje nowe pytanie; stara notatka jest dostępna w sekcji
zmienionych lub odwołanych terminów i nie jest automatycznie przepisywana.
Pytania są zawsze widoczne w aplikacji. Po włączeniu osobnej usługi Web Push
aplikacja może wysyłać także powiadomienia systemowe przy zamkniętej karcie.

Migracje w `supabase/migrations/` są wykonywane przez workflow `database.yml`
przed publikacją Pages. Wymaga on sekretu repozytorium `SUPABASE_DB_URL`
z adresem połączenia PostgreSQL przez Session pooler (port 5432).
Najprościej dodać drugi sekret `SUPABASE_DB_PASSWORD` z samym hasłem bazy,
bez kodowania. Workflow sam poprawnie zakoduje hasło i zastąpi nim hasło w URL.
Nie zapisuj hasła ani adresu połączenia w publicznych zmiennych lub plikach repozytorium.
`supabase db push` zapisuje historię wykonanych migracji i uruchamia tylko brakujące.
Błąd migracji zatrzymuje publikację nowej wersji aplikacji.
`schema.sql` jest pełnym schematem do instalacji ręcznej; jego edycja nie jest migracją.
Początkowa migracja używa `create table if not exists` i nie usuwa danych z
projektów wcześniej skonfigurowanych ręcznie.

## Zadania, statusy i własny wybór zajęć

- **Na zajęcia**: osobna lista zadań uczelnianych oraz przygotowania do zajęć z planu.
- **Poza uczelnią**: zadania prywatne. Starsze zadania trafiają tutaj; kategorię można
  zmienić podczas edycji zadania.
- **Wydarzenia**: osobna zakładka na ręczne wpisy w kalendarzu z datą i godziną.
  Pokazuje wydarzenia nadchodzące, minione i powtarzalne; pozwala je edytować oraz
  otworzyć wybrany dzień w kalendarzu. Kafelek liczy ręczne wydarzenia z najbliższych
  siedmiu dni, bez oficjalnych zajęć i zadań z deadline'em.
- Kafelki na ekranie głównym prowadzą do odpowiednich list i filtrów.
- Niebieski oznacza **Do sprawdzenia**, pomarańczowy **Do przygotowania**,
  zielony **Przygotowane** lub **Bez przygotowania**. Status jest też zapisany tekstem.
- Przycisk **Przygotowane** odznacza konkretny termin; można go ponownie otworzyć.
- W **Ustawieniach → Moje zajęcia** można ukryć wybrane przedmioty i rodzaje zajęć
  tylko na własnym koncie. Znikają z kalendarza, liczników i pytań o przygotowanie.
  Publiczny plik JSON pozostaje pełny. Wykłady i laboratoria z baz danych można
  zachować przy ukrytych ćwiczeniach.
- Jednorazowa opcja `apply_owner_filters` w ręcznym workflow migracji zapisuje
  wskazane filtry tylko wtedy, gdy baza zawiera dokładnie jedno konto. Przy wielu
  kontach kończy się bez zmiany preferencji; wtedy należy użyć własnych ustawień.

Godziny WCY są odczytywane osobno dla każdego dnia tygodnia: rozkład bloków
w weekend może różnić się od roboczego. Parser odrzuca niejednoznaczne godziny
zamiast nadpisywać wszystkie dni ostatnią znalezioną tabelą.

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

# Powiadomienia Web Push — jednorazowa konfiguracja

Powiadomienia w aplikacji (pytanie przed laboratoriami) działają od razu.
Powiadomienia systemowe także po zamknięciu aplikacji wymagają **trzech rzeczy**:
subskrypcji urządzenia, prywatnego serwera wysyłającego i harmonogramu.
Wszystkie potrzebne pliki są w repo, ale **bez skonfigurowania poniższych
sekretów wysyłka nie jest aktywna**. Domyślnie zaplanowany workflow jest
wyłączony, aby nie generować błędów i e-maili.

1. **Migracja**: workflow `database.yml` wdraża
   `supabase/migrations/20261102210000_web_push.sql`, tworząc zabezpieczoną RLS
   tabelę `push_subscriptions` i niedostępną klientom tabelę
   `notification_deliveries`. Najpierw sprawdź w Supabase, czy migracja się
   wykonała. Nie wklejaj jej ponownie jako osobnego schematu.
2. **Klucze Web Push**: na swoim komputerze uruchom
   `npx --yes web-push generate-vapid-keys --json`. Powstaną publiczny i
   prywatny klucz VAPID. Nigdy nie zapisuj prywatnego klucza w repo.
3. **Supabase → Edge Functions → Secrets**: dodaj wartości
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (np. `mailto:twoj-email@example.com`) oraz niezależny,
   losowy `CRON_SECRET` (minimum 32 znaki). Funkcja używa wbudowanego
   `SUPABASE_SERVICE_ROLE_KEY` tylko na serwerze.
4. **GitHub → Settings → Secrets and variables → Actions**:
   - Variables: `VAPID_PUBLIC_KEY` (ta sama część publiczna),
     `SUPABASE_PROJECT_REF` (identyfikator projektu w URL Dashboard);
   - Secrets: `SUPABASE_ACCESS_TOKEN` (token konta do wdrożenia funkcji),
     `WEB_PUSH_CRON_SECRET` (ta sama wartość co `CRON_SECRET` w Supabase).
   - Zachowaj istniejące `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_DB_URL` i `SUPABASE_DB_PASSWORD` zgodnie z instrukcją wyżej.
5. **GitHub → Actions**: uruchom ręcznie **Wdróż funkcję powiadomień**.
   Funkcja `send-reminders` odrzuca wszystkie zapytania bez `x-cron-secret`.
   Następnie ustaw Actions variable `WEB_PUSH_ENABLED` na dokładnie `true`
   i ponownie opublikuj Pages (doda to publiczny VAPID do `dist/config.js`).
6. Na iPhonie dodaj stronę do **ekranu początkowego**, uruchom ją jako aplikację,
   zaloguj się i wejdź w **Ustawienia → Przypomnienia na telefon → Włącz
   powiadomienia**. Safari w zwykłej karcie na iOS nie wystarczy.

Harmonogram `.github/workflows/send-reminders.yml` uruchamia się codziennie
około 09:10 czasu polskiego zimą / 10:10 latem (Github Actions nie gwarantuje
punktualności). Można też wywołać go ręcznie w Actions, aby sprawdzić wysyłkę.

System wysyła jednorazowe przypomnienie na dany termin o nieukończonym zadaniu
(dziś/jutro), o własnym laboratorium w ustawionym oknie 7/3 dni i raz na tydzień
pytanie o niesprawdzone laboratoria/ćwiczenia z opublikowanego planu grupy.
Każda subskrypcja jest powiązana z zalogowanym użytkownikiem; RLS nie pozwala
innemu kontu jej odczytać. Powiadomienia nie zawierają prywatnych notatek.
Wylogowanie najpierw wyłącza subskrypcję na tym urządzeniu. Nie ma możliwości
trwałego przypięcia powiadomienia na ekranie blokady iOS.

**Uwaga:** podczas wdrażania funkcji zweryfikuj, że migracje przeszły, a klucze
zostały dodane jako sekrety serwera, nie do publicznego pliku `config.js`.
Bez tego przycisk w ustawieniach pokaże komunikat o brakującej konfiguracji.

