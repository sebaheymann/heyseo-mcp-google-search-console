# Jak dodawac projekty Google Cloud do HeySEO MCP

Ten poradnik krok po kroku pokazuje jak stworzyc projekt w Google Cloud Console, wygenerowac credentials OAuth i podpiac je do MCP.

## Spis tresci

- [Co potrzebujesz](#co-potrzebujesz)
- [Krok 1: Stworz projekt w Google Cloud Console](#krok-1-stworz-projekt-w-google-cloud-console)
- [Krok 2: Wlacz Search Console API](#krok-2-wlacz-search-console-api)
- [Krok 3: Skonfiguruj OAuth Consent Screen](#krok-3-skonfiguruj-oauth-consent-screen)
- [Krok 4: Stworz OAuth Client ID](#krok-4-stworz-oauth-client-id)
- [Krok 5: Pobierz plik credentials JSON](#krok-5-pobierz-plik-credentials-json)
- [Krok 6: Dodaj projekt do MCP](#krok-6-dodaj-projekt-do-mcp)
- [Krok 7: Autoryzacja przez przegladarke](#krok-7-autoryzacja-przez-przegladarke)
- [Wiele projektow na jednym emailu](#wiele-projektow-na-jednym-emailu)
- [Wiele emaili](#wiele-emaili)
- [Limity API](#limity-api)
- [Rozwiazywanie problemow](#rozwiazywanie-problemow)

---

## Co potrzebujesz

- Konto Google z dostepem do Google Search Console
- Dostep do Google Cloud Console (https://console.cloud.google.com)
- Ten sam email Google ktorym logujesz sie do GSC

---

## Krok 1: Stworz projekt w Google Cloud Console

1. Otworz **https://console.cloud.google.com**
2. Na gornym pasku kliknij **selektor projektu** (obok logo "Google Cloud")
3. Kliknij **NOWY PROJEKT** (prawy gorny rog okna)
4. Wypelnij:
   - **Nazwa projektu**: np. `HeySEO GSC - Firma XYZ`
   - **Organizacja**: zostaw domyslna lub wybierz odpowiednia
   - **Lokalizacja**: zostaw domyslna
5. Kliknij **UTWORZ**
6. Poczekaj az projekt sie stworzy (kilka sekund)
7. Upewnij sie ze nowy projekt jest **wybrany** na gornym pasku

> **Tip:** Nazwa projektu jest tylko dla Twojej identyfikacji. Google nie uzywa jej nigdzie publicznie.

---

## Krok 2: Wlacz Search Console API

1. Upewnij sie ze Twoj nowy projekt jest wybrany
2. Przejdz do: **APIs & Services > Library**
   - lub otworz: https://console.cloud.google.com/apis/library
3. W wyszukiwarce wpisz: **Google Search Console API**
4. Kliknij na **Google Search Console API** (ikona Search Console)
5. Kliknij **ENABLE** (Wlacz)
6. Poczekaj az API sie aktywuje

> **Uwaga:** To jest **jedyne API** ktore musisz wlaczyc. Obsluguje wszystko: serwisy, mapy witryn, analityke, inspekcje URL, dane strukturalne.

---

## Krok 3: Skonfiguruj OAuth Consent Screen

To jest jednorazowa konfiguracja dla kazdego projektu.

1. Przejdz do: **APIs & Services > OAuth consent screen**
   - lub otworz: https://console.cloud.google.com/apis/credentials/consent
2. Wybierz **User Type**: **External** i kliknij **CREATE**
3. Wypelnij wymagane pola:
   - **App name**: `HeySEO GSC` (lub dowolna nazwa)
   - **User support email**: wybierz swoj email
   - **Developer contact information**: wpisz swoj email
4. Kliknij **SAVE AND CONTINUE**

### Scopes (zakres)

5. Kliknij **ADD OR REMOVE SCOPES**
6. W filtrze wpisz: `webmasters`
7. Zaznacz: **Google Search Console API** → `.../auth/webmasters` (Read/Write)
   - Jesli nie widzisz - wpisz recznie: `https://www.googleapis.com/auth/webmasters`
8. Kliknij **UPDATE**
9. Kliknij **SAVE AND CONTINUE**

### Test users

10. Kliknij **ADD USERS**
11. Wpisz **adres email** konta Google ktorym bedziesz sie logowac
    - Musi byc ten sam email co w Google Search Console
12. Kliknij **ADD**
13. Kliknij **SAVE AND CONTINUE**

### Podsumowanie

14. Sprawdz dane i kliknij **BACK TO DASHBOARD**

> **Wazne:** Tak dlugo jak aplikacja jest w trybie "Testing", tylko emaile dodane jako Test Users moga sie autoryzowac. To w zupelnosci wystarczy do uzytku wlasnego.

---

## Krok 4: Stworz OAuth Client ID

1. Przejdz do: **APIs & Services > Credentials**
   - lub otworz: https://console.cloud.google.com/apis/credentials
2. Kliknij **+ CREATE CREDENTIALS** na gorze
3. Wybierz **OAuth client ID**
4. Wypelnij:
   - **Application type**: **Desktop app** ← WAZNE: musi byc Desktop app
   - **Name**: `HeySEO MCP` (lub dowolna nazwa)
5. Kliknij **CREATE**

### Co zobaczysz

Pojawi sie okno z:
- **Client ID**: `123456789-abc...apps.googleusercontent.com`
- **Client secret**: `GOCSPX-...`

**Nie musisz nic kopiowac** - za chwile pobierzesz caly plik JSON.

---

## Krok 5: Pobierz plik credentials JSON

1. Na liscie **OAuth 2.0 Client IDs** znajdz swoj nowo stworzony Client ID
2. Kliknij ikone **pobierania** (strzalka w dol) po prawej stronie
   - lub kliknij na nazwe i potem **DOWNLOAD JSON**
3. Zapisz plik w bezpiecznym miejscu, np.:
   - macOS: `/Users/twoj-user/gsc-credentials/client_secret_firma-xyz.json`
   - Windows: `C:\Users\twoj-user\gsc-credentials\client_secret_firma-xyz.json`
   - Linux: `/home/twoj-user/gsc-credentials/client_secret_firma-xyz.json`

### Zawartosc pliku (przyklad)

```json
{
  "installed": {
    "client_id": "123456789-abcdefghijklmn.apps.googleusercontent.com",
    "project_id": "heyseo-gsc-firma-xyz",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "GOCSPX-aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    "redirect_uris": ["http://localhost"]
  }
}
```

> **Uwaga:** Plik musi miec sekcje `"installed"` (Desktop App). Jesli ma `"web"` to znaczy ze wybrales zly typ aplikacji.

> **Bezpieczenstwo:** Ten plik sam w sobie nie daje dostepu do Twoich danych. Wymagana jest jeszcze autoryzacja przez przegladarke (logowanie kontem Google). Mimo to traktuj go jak credentials - nie commituj do publicznego repozytorium.

---

## Krok 6: Dodaj projekt do MCP

W Claude (Desktop lub Code) uzyj narzedzia `add_account`:

```
add_account(
  name: "Firma XYZ",
  email: "jan@firma.pl",
  clientSecretPath: "/Users/jan/gsc-credentials/client_secret_firma-xyz.json"
)
```

### Co sie dzieje

1. MCP waliduje plik JSON (sprawdza client_id i client_secret)
2. **Kopiuje** plik do `~/.heyseo-gsc/client_secret_firma-xyz.json`
3. Tworzy wpis w `~/.heyseo-gsc/config.json`
4. Jesli to pierwsze konto - ustawia je jako aktywne

### Parametry

| Parametr | Opis |
|----------|------|
| `name` | Twoja nazwa projektu. Staje sie ID konta (kebab-case). Np. "Firma XYZ" → ID: `firma-xyz` |
| `email` | Email konta Google. Projekty z tym samym emailem sa grupowane dla failover |
| `clientSecretPath` | Sciezka do pobranego pliku JSON z kroku 5 |

---

## Krok 7: Autoryzacja przez przegladarke

Autoryzacja nastepuje **automatycznie** przy pierwszym uzyciu API (np. `refresh_cache`).

1. W Claude napisz: `refresh_cache()`
2. **Przegladarka otworzy sie automatycznie** z ekranem logowania Google
3. Zaloguj sie kontem Google ktore ma dostep do GSC
4. Google pokaze ekran zgody:
   - "HeySEO GSC wants to access your Google Account"
   - "View and manage Search Console data for your verified sites"
5. Kliknij **Allow** (Zezwol)
6. Zobaczysz strone: "HeySEO GSC - Autoryzacja zakonczona!"
7. Mozesz zamknac zakladke przegladarki
8. Wroc do Claude - `refresh_cache()` dokonczy dzialanie

### Gdzie zapisywany jest token

Token (access_token + refresh_token) zapisuje sie w:
```
~/.heyseo-gsc/token_firma-xyz.json
```

### Auto-refresh

- Token access wygasa po ~1 godzinie
- MCP automatycznie uzywa refresh_token aby uzyskac nowy access_token
- **Nie musisz ponownie logowac sie przez przegladarke** (chyba ze uzyjesz `reset_account_auth`)

---

## Wiele projektow na jednym emailu

Mozesz miec **wiele projektow Google Cloud** powiazanych z tym samym kontem Google. Kazdy projekt ma osobne limity API.

### Po co?

- Kazdy projekt GCP ma limit **1 200 requestow / minutę** do Search Console API
- 3 projekty na jednym emailu = efektywnie **3 600 requestow / minutę**
- Failover automatycznie przelacza miedzy projektami przy rate limit

### Jak to zrobic

Powtorz kroki 1-6 dla kazdego projektu, uzywajac **tego samego emaila**:

```
add_account(name: "Firma - Projekt 1", email: "jan@firma.pl", clientSecretPath: "/path/to/secret1.json")
add_account(name: "Firma - Projekt 2", email: "jan@firma.pl", clientSecretPath: "/path/to/secret2.json")
add_account(name: "Firma - Projekt 3", email: "jan@firma.pl", clientSecretPath: "/path/to/secret3.json")
```

### Wazne

- Kazdy projekt wymaga **osobnego OAuth Client ID** (osobny plik JSON)
- Przy autoryzacji (`refresh_cache`) logowanie nastepuje **raz per projekt** - tym samym kontem Google
- Po autoryzacji wszystkich projektow, system plynnie przelacza miedzy nimi

---

## Wiele emaili

Mozesz podpiac **rozne konta Google** (rozne emaile). Przydatne gdy:

- Masz osobne konto firmowe i agencyjne
- Zarzadzasz serwisami klientow na ich kontach
- Chcesz maksymalizowac limity API

### Jak to zrobic

```
# Email 1 - firma
add_account(name: "Firma - Proj 1", email: "jan@firma.pl", clientSecretPath: "/path/to/firma1.json")
add_account(name: "Firma - Proj 2", email: "jan@firma.pl", clientSecretPath: "/path/to/firma2.json")

# Email 2 - agencja
add_account(name: "Agencja - Proj 1", email: "anna@agencja.pl", clientSecretPath: "/path/to/agencja1.json")
add_account(name: "Agencja - Proj 2", email: "anna@agencja.pl", clientSecretPath: "/path/to/agencja2.json")

# Odswiez cache
refresh_cache()
```

### Kolejnosc failover

Przy rate limit na projekcie "Firma - Proj 1" (jan@firma.pl):

1. Przelacz na **"Firma - Proj 2"** (ten sam email, inna pula limitow projektu)
2. Jesli tez rate limit → przelacz na **"Agencja - Proj 1"** (inny email z dostepem do serwisu)
3. Jesli tez rate limit → przelacz na **"Agencja - Proj 2"**
4. Jesli wszystko wyczerpane → zwroc czesciowe dane z `incomplete: true`

### Autoryzacja wielu emaili

Kazdy email wymaga **osobnego logowania** przez przegladarke:

1. `refresh_cache()` → otwiera przegladarke dla pierwszego nieautoryzowanego konta
2. Loguj sie kontem jan@firma.pl → zatwierdz
3. `refresh_cache()` ponownie → otwiera dla kolejnego konta
4. Loguj sie kontem anna@agencja.pl → zatwierdz
5. Od teraz tokeny sa zapisane i autoryzacja nie jest wymagana

---

## Limity API

### Limity Google Search Console API

| Metoda | Limit per projekt | Limit per uzytkownika |
|--------|-------------------|----------------------|
| Search Analytics query | 1 200 / min | 200 / min |
| URL Inspection | 2 000 / dzien (per serwis) | 600 / min |
| Sitemaps | 600 / min | 100 / min |
| Sites | 600 / min | 100 / min |

### Jak to wplywa na MCP

- **1 projekt, 1 email:** Standardowe limity
- **3 projekty, 1 email:** 3x limit per projekt, ale limity per uzytkownika (email) sa wspolne
- **3 projekty, 2 emaile:** 3x limit per projekt + 2x limit per uzytkownika
- **Failover** przelacza automatycznie - nie musisz sie martwic o limity

### URL Inspection - szczegolne limity

URL Inspection ma limit **2 000 requestow dziennie na serwis**. Ten limit jest per serwis, nie per projekt/email. Wiele kont nie pomoze obejsc tego limitu.

---

## Rozwiazywanie problemow

### "Przegladarka sie nie otwiera"

MCP wyswietla URL autoryzacji w logach serwera. Skopiuj go i otworz recznie w przegladarce.

### "Access denied" / 403

1. Sprawdz czy email konta Google ma dostep do serwisu w GSC
2. Sprawdz czy email jest dodany jako Test User w OAuth consent screen
3. Sprawdz czy scope `webmasters` jest dodany w consent screen

### "Invalid client secret"

1. Upewnij sie ze pobrales credentials typu **Desktop app** (nie Web application)
2. Sprawdz czy plik JSON ma sekcje `"installed"` (nie `"web"`)
3. Sprobuj pobrac plik ponownie z Google Cloud Console

### "Rate limit exceeded" mimo wielu projektow

1. Sprawdz czy failover dziala: `list_accounts` → powinno pokazac wiele projektow
2. Sprawdz czy cache jest aktualny: `cache_status` → jesli stary, `refresh_cache`
3. Limity per-uzytkownika sa wspolne dla projektow na tym samym emailu

### "Token expired" / 401

Uzyj `reset_account_auth(accountId: "firma-xyz")` aby wymusic ponowne logowanie.

### Reset calej konfiguracji

Usun folder `~/.heyseo-gsc/` i zacznij od nowa:

```bash
rm -rf ~/.heyseo-gsc
```
