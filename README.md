# HeySEO MCP Google Search Console

MCP (Model Context Protocol) server zapewniajacy pelna integracje z Google Search Console API v1. Obsluguje wiele kont Google i projektow Google Cloud jednoczesnie, z lokalnym cache serwisow i automatycznym failoverem miedzy kontami przy przekroczeniu limitow API.

## Spis tresci

- [Glowne funkcje](#glowne-funkcje)
- [Architektura](#architektura)
- [Folder konfiguracyjny](#folder-konfiguracyjny)
- [Narzedzia (22)](#narzedzia-22)
- [Szczegolowy opis narzedzi](#szczegolowy-opis-narzedzi)
- [System multi-kont](#system-multi-kont)
- [Lokalny cache](#lokalny-cache)
- [Auto-failover](#auto-failover)
- [Paginacja Search Analytics](#paginacja-search-analytics)
- [URL Inspection - sekcje](#url-inspection---sekcje)
- [Formaty URL serwisow](#formaty-url-serwisow)
- [Kody bledow](#kody-bledow)
- [Wymagania](#wymagania)

---

## Glowne funkcje

| Funkcja | Opis |
|---------|------|
| **Multi-Account** | Wiele kont Google + wiele projektow Google Cloud jednoczesnie |
| **Lokalny Cache** | Lista serwisow zapisana lokalnie w pliku - zero requestow API przy listowaniu |
| **Auto-Failover** | Przy rate limit (429) automatyczne przelaczanie na inne konto i kontynuacja |
| **OAuth 2.0 Desktop App** | Logowanie przez przegladarke kontem Google (jak Screaming Frog) |
| **Search Analytics** | Auto-paginacja do 10M wierszy w chunkach po 25k z failoverem w trakcie |
| **URL Inspection** | Indeksowanie, mobile, AMP + osobna walidacja danych strukturalnych |
| **Sections Filter** | Mozliwosc wyboru ktore sekcje inspekcji URL zwrocic |
| **Sitemap Management** | Listowanie, wysylanie, usuwanie map witryn |

---

## Architektura

```
+------------------+       +------------------------+       +-------------------+
|   Claude Code    | stdio |  HeySEO MCP Server     |  API  |  Google Search    |
|   Claude Desktop | <---> |  (Node.js / TypeScript) | <---> |  Console API v1   |
+------------------+       +------------------------+       +-------------------+
                                    |
                                    v
                           ~/.heyseo-gsc/
                           (config, cache, tokeny)
```

### Przeplyw danych

1. **Claude** wywoluje narzedzie MCP (np. `query_search_analytics`)
2. **MCP Server** sprawdza aktywne konto i buduje request
3. Jesli rate limit (429) → **Failover** szuka alternatywnego konta
4. **Google API** zwraca dane
5. **MCP Server** formatuje odpowiedz jako JSON i zwraca do Claude

### Pliki zrodlowe

```
src/
├── index.ts              ← Entry point: rejestracja 22 narzedzi, dispatcher, start serwera
├── auth.ts               ← OAuth 2.0 Desktop App flow: logowanie, tokeny, refresh
├── accounts.ts           ← Zarzadzanie kontami: config.json, dodawanie/usuwanie kont
├── cache.ts              ← Lokalny cache serwisow: sites.json, odswiezanie, wyszukiwanie
├── failover.ts           ← Auto-przelaczanie kont: kolejnosc, rate limit tracking, cooldown
├── types.ts              ← Interfejsy TypeScript (Verdict, IndexStatusResult, itp.)
├── tools/
│   ├── sites.ts          ← list_sites (z cache), get/add/delete_site (API+failover)
│   ├── sitemaps.ts       ← list/get/submit/delete_sitemap (API+failover)
│   ├── searchAnalytics.ts ← query_search_analytics (paginacja+failover w trakcie)
│   ├── urlInspection.ts  ← inspect_url z sections, per-sekcja, batch (API+failover)
│   └── richResults.ts    ← inspect_url_rich_results (API+failover)
└── utils/
    └── errors.ts         ← Formatowanie bledow, mapowanie HTTP status, walidacja
```

---

## Folder konfiguracyjny

Wszystkie dane MCP sa zapisywane w `~/.heyseo-gsc/`:

```
~/.heyseo-gsc/
├── config.json                          ← Lista kont, aktywne konto
├── cache/
│   └── sites.json                       ← Cache serwisow dla kazdego konta
├── client_secret_firma-xyz.json         ← Skopiowane credentials OAuth (per projekt)
├── token_firma-xyz.json                 ← Token OAuth z refresh (per projekt)
├── client_secret_klient-abc.json
├── token_klient-abc.json
└── ...
```

### config.json - przykladowa struktura

```json
{
  "activeAccountId": "firma-xyz",
  "accounts": [
    {
      "id": "firma-xyz",
      "name": "Firma XYZ",
      "email": "jan@firma.pl",
      "clientSecretPath": "/Users/user/.heyseo-gsc/client_secret_firma-xyz.json",
      "tokenPath": "/Users/user/.heyseo-gsc/token_firma-xyz.json"
    },
    {
      "id": "klient-abc",
      "name": "Klient ABC",
      "email": "jan@firma.pl",
      "clientSecretPath": "/Users/user/.heyseo-gsc/client_secret_klient-abc.json",
      "tokenPath": "/Users/user/.heyseo-gsc/token_klient-abc.json"
    }
  ]
}
```

### cache/sites.json - przykladowa struktura

```json
{
  "lastFullRefresh": "2025-03-19T10:30:00.000Z",
  "accounts": [
    {
      "accountId": "firma-xyz",
      "accountName": "Firma XYZ",
      "lastUpdated": "2025-03-19T10:30:00.000Z",
      "sites": [
        { "siteUrl": "sc-domain:firma.pl", "permissionLevel": "siteOwner" },
        { "siteUrl": "https://sklep.firma.pl/", "permissionLevel": "siteFullUser" }
      ]
    }
  ]
}
```

---

## Narzedzia (22)

### Zarzadzanie kontami (5)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 1 | `list_accounts` | config.json | Lista kont pogrupowana po emailach, pokazuje aktywne konto |
| 2 | `add_account` | config.json | Dodaj projekt GCP + email. Kopiuje credentials do ~/.heyseo-gsc/ |
| 3 | `remove_account` | config.json | Usun konto + token + credentials z dysku |
| 4 | `switch_account` | config.json | Ustaw domyslne aktywne konto |
| 5 | `reset_account_auth` | token file | Reset tokena OAuth → wymusza ponowne logowanie |

### Cache (2)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 6 | `refresh_cache` | API → cache | Pobiera serwisy z API dla wszystkich (lub jednego) kont, zapisuje do sites.json |
| 7 | `cache_status` | cache | Pokazuje kiedy ostatnio odswiezony, ile kont i serwisow w cache |

### Serwisy GSC (4)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 8 | `list_sites` | **cache** | Lista serwisow z pliku - **ZERO requestow API**. Pokazuje ktore konta maja dostep |
| 9 | `get_site` | API + failover | Szczegoly serwisu (siteUrl, permissionLevel) |
| 10 | `add_site` | API + failover | Dodaj serwis do GSC |
| 11 | `delete_site` | API + failover | Usun serwis z GSC |

### Mapy witryn (4)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 12 | `list_sitemaps` | API + failover | Lista map witryn (path, status, errors, warnings, contents) |
| 13 | `get_sitemap` | API + failover | Szczegoly mapy (ilosc URL submitted/indexed, bledy) |
| 14 | `submit_sitemap` | API + failover | Wyslij/ponow mape witryn do Google |
| 15 | `delete_sitemap` | API + failover | Usun mape witryn |

### Analityka wyszukiwania (1)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 16 | `query_search_analytics` | API + failover + paginacja | Pobieranie danych skutecznosci z auto-paginacja do 10M wierszy |

### Inspekcja URL - kombinowane (2)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 17 | `inspect_url` | API + failover | Inspekcja URL z opcjonalnym filtrem `sections`. Domyslnie: indexStatus + mobile + amp |
| 18 | `batch_inspect_urls` | API + failover | Batch inspekcja do 50 URL z filtrem `sections` |

### Inspekcja URL - per sekcja (4)

| # | Narzedzie | Zrodlo danych | Opis |
|---|-----------|---------------|------|
| 19 | `inspect_url_index_status` | API + failover | TYLKO status indeksowania |
| 20 | `inspect_url_mobile` | API + failover | TYLKO mobile usability |
| 21 | `inspect_url_amp` | API + failover | TYLKO wyniki AMP |
| 22 | `inspect_url_rich_results` | API + failover | TYLKO dane strukturalne / rich results |

---

## Szczegolowy opis narzedzi

### list_accounts

Zwraca liste kont pogrupowana po adresach email.

**Parametry:** brak

**Odpowiedz:**
```json
{
  "configDir": "~/.heyseo-gsc",
  "activeAccountId": "firma-xyz",
  "totalEmails": 2,
  "totalProjects": 4,
  "byEmail": [
    {
      "email": "jan@firma.pl",
      "projectCount": 2,
      "projects": [
        { "id": "firma-xyz", "name": "Firma XYZ", "isActive": true },
        { "id": "firma-proj-2", "name": "Firma - Projekt 2", "isActive": false }
      ]
    },
    {
      "email": "anna@agencja.pl",
      "projectCount": 2,
      "projects": [
        { "id": "agencja-glowny", "name": "Agencja - Glowny", "isActive": false },
        { "id": "agencja-klient", "name": "Agencja - Klient X", "isActive": false }
      ]
    }
  ],
  "failoverOrder": "On rate limit: 1) other projects on same email -> 2) projects on other emails with site access -> 3) all remaining projects on other emails"
}
```

---

### add_account

Dodaje nowy projekt Google Cloud. Kopiuje plik credentials do `~/.heyseo-gsc/`.

**Parametry:**

| Parametr | Wymagany | Opis |
|----------|----------|------|
| `name` | tak | Przyjazna nazwa projektu (np. "Firma XYZ - Projekt 1"). Staje sie ID konta (kebab-case) |
| `email` | tak | Email konta Google (np. "jan@firma.pl"). Projekty z tym samym emailem sa grupowane dla failover |
| `clientSecretPath` | tak | Sciezka absolutna do pliku JSON OAuth Client ID |

**Odpowiedz:**
```json
{
  "message": "Project \"Firma XYZ\" (ID: firma-xyz) added for email jan@firma.pl.",
  "account": { "id": "firma-xyz", "name": "Firma XYZ", "email": "jan@firma.pl" },
  "nextStep": "Run refresh_cache to fetch sites. Browser will open for OAuth consent on first API call."
}
```

---

### remove_account

Usuwa konto, plik tokena i skopiowane credentials.

**Parametry:** `accountId` (wymagany)

---

### switch_account

Ustawia domyslne aktywne konto. Narzedzia bez jawnego `accountId` uzywaja tego konta.

**Parametry:** `accountId` (wymagany)

---

### reset_account_auth

Kasuje zapisany token OAuth. Nastepne wywolanie API otworzy przegladarke do ponownego logowania.

**Parametry:** `accountId` (opcjonalny - domyslnie aktywne konto)

---

### refresh_cache

Pobiera liste serwisow z Google Search Console API i zapisuje do pliku `~/.heyseo-gsc/cache/sites.json`.

**Parametry:** `accountId` (opcjonalny - jesli podany, odswieza tylko to konto; jesli nie, odswieza WSZYSTKIE)

**Odpowiedz (wszystkie konta):**
```json
{
  "message": "Cache refreshed for all 3 account(s).",
  "lastFullRefresh": "2025-03-19T10:30:00.000Z",
  "accounts": [
    { "accountId": "firma-xyz", "accountName": "Firma XYZ", "sitesCount": 5, "lastUpdated": "..." },
    { "accountId": "klient-abc", "accountName": "Klient ABC", "sitesCount": 3, "lastUpdated": "..." }
  ],
  "totalSites": 8
}
```

---

### cache_status

Pokazuje stan cache bez odswiezania.

**Parametry:** brak

---

### list_sites

Czyta serwisy z **lokalnego cache** - zero requestow API.

**Parametry:** `accountId` (opcjonalny - filtruje po koncie)

**Odpowiedz (bez filtra):**
```json
{
  "source": "cache",
  "lastFullRefresh": "2025-03-19T10:30:00.000Z",
  "totalAccounts": 2,
  "totalUniqueSites": 7,
  "sites": [
    {
      "siteUrl": "sc-domain:firma.pl",
      "permissionLevel": "siteOwner",
      "accounts": ["firma-xyz", "agencja-glowny"]
    },
    {
      "siteUrl": "https://sklep.firma.pl/",
      "permissionLevel": "siteFullUser",
      "accounts": ["firma-xyz"]
    }
  ]
}
```

---

### get_site / add_site / delete_site

Operacje na serwisach GSC przez API z auto-failoverem.

**Parametry:** `siteUrl` (wymagany), `accountId` (opcjonalny)

---

### list_sitemaps

Lista map witryn z detalami.

**Parametry:** `siteUrl` (wymagany), `sitemapIndex` (opcjonalny - filtruj po sitemap index), `accountId` (opcjonalny)

**Odpowiedz:**
```json
{
  "totalSitemaps": 3,
  "sitemaps": [
    {
      "path": "https://firma.pl/sitemap.xml",
      "lastSubmitted": "2025-03-15T...",
      "lastDownloaded": "2025-03-18T...",
      "isPending": false,
      "isSitemapsIndex": true,
      "type": "sitemap",
      "warnings": "0",
      "errors": "0",
      "contents": [
        { "type": "web", "submitted": "1250", "indexed": "1100" }
      ]
    }
  ],
  "_usedAccountId": "firma-xyz"
}
```

---

### get_sitemap / submit_sitemap / delete_sitemap

**Parametry:** `siteUrl` (wymagany), `feedpath` (wymagany - pelny URL mapy), `accountId` (opcjonalny)

---

### query_search_analytics

Pobieranie danych skutecznosci z Google Search Console z automatyczna paginacja.

**Parametry:**

| Parametr | Wymagany | Typ | Opis |
|----------|----------|-----|------|
| `siteUrl` | tak | string | URL serwisu |
| `startDate` | tak | string | Data poczatkowa YYYY-MM-DD |
| `endDate` | tak | string | Data koncowa YYYY-MM-DD |
| `dimensions` | nie | string[] | Wymiary grupowania. Opcje: `query`, `page`, `country`, `device`, `date`, `searchAppearance`. Domyslnie: `["query"]` |
| `searchType` | nie | string | Typ wyszukiwania: `web`, `image`, `video`, `news`, `discover`. Domyslnie: `web` |
| `dimensionFilterGroups` | nie | object[] | Filtry wymiarow (contains, equals, regex itp.) |
| `aggregationType` | nie | string | `auto`, `byPage`, `byProperty` |
| `dataState` | nie | string | `all` (domyslnie, wlacznie ze swiezymi danymi) lub `final` (tylko potwierdzone, 2-3 dni opoznienia) |
| `rowLimit` | nie | number | Max wierszy do pobrania (do 10 000 000). Domyslnie: wszystkie dostepne |
| `accountId` | nie | string | Konto do uzycia |

**Filtry - przyklad:**
```json
{
  "dimensionFilterGroups": [
    {
      "groupType": "and",
      "filters": [
        { "dimension": "query", "operator": "contains", "expression": "seo" },
        { "dimension": "country", "operator": "equals", "expression": "pol" }
      ]
    }
  ]
}
```

**Dostepne operatory filtrow:** `contains`, `equals`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex`

**Odpowiedz:**
```json
{
  "siteUrl": "sc-domain:firma.pl",
  "startDate": "2025-01-01",
  "endDate": "2025-03-01",
  "dimensions": ["query"],
  "searchType": "web",
  "totalRows": 75000,
  "pagesRetrieved": 3,
  "accountsUsed": ["firma-xyz", "klient-abc"],
  "accountSwitches": 1,
  "incomplete": false,
  "rows": [
    { "keys": ["fraza kluczowa"], "clicks": 150, "impressions": 3200, "ctr": 0.047, "position": 4.2 }
  ]
}
```

**Jak dziala paginacja:**
- Google API zwraca max 25 000 wierszy per request
- Narzedzie automatycznie wysyla kolejne requesty z `startRow` = 0, 25000, 50000...
- Przy rate limit przełacza konto i kontynuuje od dokladnego wiersza
- Jesli WSZYSTKIE konta wyczerpane → zwraca czesciowe dane z `incomplete: true` i `lastStartRow`

---

### inspect_url

Inspekcja URL z opcjonalnym wyborem sekcji.

**Parametry:**

| Parametr | Wymagany | Typ | Opis |
|----------|----------|-----|------|
| `siteUrl` | tak | string | URL serwisu w GSC |
| `inspectionUrl` | tak | string | Pelny URL do inspekcji |
| `sections` | nie | string[] | Ktore sekcje zwrocic: `indexStatus`, `mobile`, `amp`. Domyslnie: wszystkie 3 |
| `languageCode` | nie | string | Kod jezyka BCP-47 (np. "pl", "en"). Domyslnie: "en" |
| `accountId` | nie | string | Konto do uzycia |

**Przyklady uzycia:**
```
// Wszystkie sekcje (domyslne)
inspect_url(siteUrl: "sc-domain:firma.pl", inspectionUrl: "https://firma.pl/oferta")

// Tylko indeksowanie
inspect_url(siteUrl: "sc-domain:firma.pl", inspectionUrl: "https://firma.pl/oferta", sections: ["indexStatus"])

// Mobile + AMP
inspect_url(siteUrl: "sc-domain:firma.pl", inspectionUrl: "https://firma.pl/oferta", sections: ["mobile", "amp"])
```

**Odpowiedz (pelna):**
```json
{
  "inspectionUrl": "https://firma.pl/oferta",
  "_usedAccountId": "firma-xyz",
  "_sections": ["indexStatus", "mobile", "amp"],
  "inspectionResultLink": "https://search.google.com/search-console/...",
  "indexStatusResult": {
    "verdict": "PASS",
    "coverageState": "Submitted and indexed",
    "robotsTxtState": "ALLOWED",
    "indexingState": "INDEXING_ALLOWED",
    "lastCrawlTime": "2025-03-15T10:30:00Z",
    "pageFetchState": "SUCCESSFUL",
    "googleCanonical": "https://firma.pl/oferta",
    "userCanonical": "https://firma.pl/oferta",
    "crawledAs": "MOBILE",
    "sitemap": ["https://firma.pl/sitemap.xml"],
    "referringUrls": ["https://firma.pl/", "https://firma.pl/uslugi"]
  },
  "mobileUsabilityResult": {
    "verdict": "PASS",
    "issues": []
  },
  "ampResult": {
    "verdict": "VERDICT_UNSPECIFIED"
  }
}
```

---

### inspect_url_index_status

Zwraca TYLKO status indeksowania.

**Odpowiedz:**
```json
{
  "inspectionUrl": "https://firma.pl/oferta",
  "_usedAccountId": "firma-xyz",
  "indexStatusResult": {
    "verdict": "PASS",
    "coverageState": "Submitted and indexed",
    "robotsTxtState": "ALLOWED",
    "indexingState": "INDEXING_ALLOWED",
    "lastCrawlTime": "2025-03-15T10:30:00Z",
    "pageFetchState": "SUCCESSFUL",
    "googleCanonical": "https://firma.pl/oferta",
    "userCanonical": "https://firma.pl/oferta",
    "crawledAs": "MOBILE",
    "sitemap": ["https://firma.pl/sitemap.xml"],
    "referringUrls": ["https://firma.pl/"]
  }
}
```

---

### inspect_url_mobile

Zwraca TYLKO mobile usability.

**Odpowiedz:**
```json
{
  "inspectionUrl": "https://firma.pl/oferta",
  "_usedAccountId": "firma-xyz",
  "mobileUsabilityResult": {
    "verdict": "FAIL",
    "issues": [
      {
        "issueType": "MOBILE_FRIENDLY_RULE_UNSPECIFIED",
        "severity": "ERROR",
        "message": "Text too small to read"
      }
    ]
  }
}
```

---

### inspect_url_amp

Zwraca TYLKO wyniki AMP.

**Odpowiedz:**
```json
{
  "inspectionUrl": "https://firma.pl/oferta",
  "_usedAccountId": "firma-xyz",
  "ampResult": {
    "verdict": "PASS",
    "ampUrl": "https://firma.pl/amp/oferta",
    "ampIndexStatusVerdict": "PASS",
    "robotsTxtState": "ALLOWED",
    "indexingState": "INDEXING_ALLOWED",
    "pageFetchState": "SUCCESSFUL",
    "issues": []
  }
}
```

---

### inspect_url_rich_results

Zwraca TYLKO dane strukturalne / rich results.

**Odpowiedz:**
```json
{
  "inspectionUrl": "https://firma.pl/oferta",
  "_usedAccountId": "firma-xyz",
  "richResultsResult": {
    "verdict": "FAIL",
    "detectedItems": [
      {
        "richResultType": "Product",
        "items": [
          {
            "name": "Product: Usluga SEO",
            "issues": [
              { "issueMessage": "Missing field 'price'", "severity": "ERROR" },
              { "issueMessage": "Missing field 'review'", "severity": "WARNING" }
            ]
          }
        ]
      },
      {
        "richResultType": "BreadcrumbList",
        "items": [
          { "name": "BreadcrumbList", "issues": [] }
        ]
      }
    ]
  }
}
```

---

### batch_inspect_urls

Inspekcja wielu URL naraz (max 50). Obsluguje `sections` filter.

**Parametry:** `siteUrl`, `urls` (tablica), `sections` (opcjonalny), `languageCode` (opcjonalny), `accountId` (opcjonalny)

**Odpowiedz:**
```json
{
  "siteUrl": "sc-domain:firma.pl",
  "totalRequested": 10,
  "totalSuccess": 9,
  "totalErrors": 1,
  "accountsUsed": ["firma-xyz", "klient-abc"],
  "results": [ ... ],
  "errors": [
    { "url": "https://firma.pl/nie-istnieje", "error": "Not found (404)..." }
  ]
}
```

---

## System multi-kont

### Struktura kont

```
Email: jan@firma.pl
  ├── Projekt "Firma XYZ"         (client_secret_firma-xyz.json)
  ├── Projekt "Firma - Projekt 2" (client_secret_firma-proj-2.json)
  └── Projekt "Firma - Projekt 3" (client_secret_firma-proj-3.json)

Email: anna@agencja.pl
  ├── Projekt "Agencja - Glowny"  (client_secret_agencja-glowny.json)
  └── Projekt "Agencja - Klient"  (client_secret_agencja-klient.json)
```

### Jak to dziala

- Kazdy **projekt Google Cloud** ma wlasny OAuth Client ID (plik JSON)
- Kazdy projekt jest powiazany z **emailem** konta Google
- Projekty z tym samym emailem sa **grupowane** - failover najpierw przelacza w ramach grupy
- **Aktywne konto** to domyslne konto uzywane gdy nie podasz `accountId`
- Kazde narzedzie API przyjmuje opcjonalny `accountId` aby uzyc konkretnego konta

---

## Lokalny cache

### Po co?

- `list_sites` bez cache = request API za kazdym razem = zuzywanie limitu
- Z cache = odczyt z pliku = zero requestow = natychmiastowe

### Jak dziala

1. `refresh_cache()` → pobiera serwisy z API dla WSZYSTKICH kont → zapisuje do `~/.heyseo-gsc/cache/sites.json`
2. `list_sites()` → czyta z pliku, pokazuje ktore konta maja dostep do kazdego serwisu
3. `cache_status()` → pokazuje kiedy ostatnio odswiezone
4. Cache jest tez uzywany przez **failover** do znalezienia kont z dostepem do danego serwisu

### Kiedy odswiezac

- Po dodaniu nowego konta (`add_account`)
- Po dodaniu/usunieciu serwisu (`add_site` / `delete_site` - narzedzie przypomina)
- Jesli podejrzewasz ze cos sie zmienilo w GSC

---

## Auto-failover

### Kiedy sie uruchamia

Gdy Google API zwroci **HTTP 429** (rate limit exceeded).

### Kolejnosc przelaczania

| Priorytet | Konto | Logika |
|-----------|-------|--------|
| 1 | Zadane/aktywne konto | Domyslne - pierwsze probe |
| 2 | Inne projekty na **tym samym emailu** z dostepem do serwisu | Z cache - te same limity konta Google ale inne limity projektu GCP |
| 3 | Wszystkie projekty na **tym samym emailu** | Moze maja dostep |
| 4 | Projekty na **innym emailu** z dostepem do serwisu | Z cache - osobne limity |
| 5 | Wszystkie projekty na **innych emailach** | Ostatnia deska ratunku |
| 6 | Konta w cooldown (rate-limited) | Jesli nic innego nie jest dostepne |

### Cooldown

- Konto po rate limit jest oznaczane na **60 sekund** cooldownu
- Podczas cooldownu system automatycznie pomija to konto
- Po 60 sekundach konto wraca do puli

### Informacje w odpowiedzi

Kazda odpowiedz z API zawiera:
- `_usedAccountId` - ktore konto zostalo uzyte
- `accountsUsed` - lista wszystkich uzytych kont (przy failover)
- `accountSwitches` - ile razy nastapilo przelaczenie

---

## Paginacja Search Analytics

### Problem

Google Search Console API zwraca max **25 000 wierszy** per request.

### Rozwiazanie

```
rowLimit uzytkownika (np. 100 000)
    |
    v
Chunk 1: startRow=0,      rowLimit=25000  → 25 000 wierszy
Chunk 2: startRow=25000,   rowLimit=25000  → 25 000 wierszy
Chunk 3: startRow=50000,   rowLimit=25000  → 25 000 wierszy
Chunk 4: startRow=75000,   rowLimit=25000  → 25 000 wierszy ← rate limit!
    |
    v [failover → inne konto]
Chunk 4: startRow=75000,   rowLimit=25000  → 25 000 wierszy ← sukces
    |
    v
Zwraca 100 000 wierszy
```

### Warunki stopu

1. API zwraca 0 wierszy (brak danych)
2. API zwraca mniej wierszy niz `rowLimit` chunka (ostatnia strona)
3. Osiagniety `rowLimit` uzytkownika
4. WSZYSTKIE konta rate-limited → zwraca czesciowe dane z `incomplete: true`

### Czesciowe dane

Jesli wszystkie konta wyczerpane, odpowiedz zawiera:
```json
{
  "incomplete": true,
  "incompleteReason": "All accounts rate-limited. Partial data returned.",
  "lastStartRow": 75000,
  "totalRows": 75000,
  "rows": [...]
}
```

Mozna wznowic pobieranie pozniej podajac wlasny startRow w filtrach.

---

## URL Inspection - sekcje

### Dwa sposoby wyboru

**Sposob 1: parametr `sections` w `inspect_url`**

```
inspect_url(sections: ["indexStatus"])           ← tylko indeksowanie
inspect_url(sections: ["mobile", "amp"])         ← mobile + AMP
inspect_url(sections: ["indexStatus", "mobile"]) ← indeksowanie + mobile
inspect_url()                                    ← wszystko (domyslne)
```

**Sposob 2: dedykowane narzedzia**

| Narzedzie | Sekcja |
|-----------|--------|
| `inspect_url_index_status` | verdict, coverageState, robotsTxtState, indexingState, lastCrawlTime, pageFetchState, googleCanonical, userCanonical, crawledAs, sitemap[], referringUrls[] |
| `inspect_url_mobile` | verdict, issues[] (issueType, severity, message) |
| `inspect_url_amp` | verdict, ampUrl, ampIndexStatusVerdict, robotsTxtState, indexingState, pageFetchState, issues[] |
| `inspect_url_rich_results` | verdict, detectedItems[] (richResultType, items[] z name + issues[] z severity/issueMessage) |

### Wartosci Verdict

Kazda sekcja inspekcji zwraca pole `verdict` z jedna z wartosci:

| Verdict | Znaczenie |
|---------|-----------|
| `PASS` | URL przeszedl inspekcje pomyslnie |
| `FAIL` | Wykryto problemy |
| `NEUTRAL` | Brak danych / nie dotyczy |
| `VERDICT_UNSPECIFIED` | Brak informacji |

---

## Formaty URL serwisow

| Typ | Format | Przyklad |
|-----|--------|---------|
| Domain property | `sc-domain:domena.pl` | `sc-domain:firma.pl` |
| URL-prefix property | `https://domena.pl/` | `https://www.firma.pl/` |

**Uwaga:** Format musi dokladnie odpowiadac temu co jest w Google Search Console. Uzyj `list_sites` aby zobaczyc dokladne URL-e.

---

## Kody bledow

| HTTP Status | Komunikat | Co robic |
|-------------|-----------|----------|
| 401 | Token wygasl lub nieprawidlowy | Uzyj `reset_account_auth` i sprobuj ponownie |
| 403 | Brak uprawnien do serwisu | Sprawdz czy konto Google ma dostep w GSC |
| 404 | Serwis nie znaleziony | Sprawdz format URL (sc-domain: vs https://) |
| 429 | Rate limit | Automatyczny failover. Jesli wszystkie konta wyczerpane - poczekaj |
| 500/503 | Blad serwera Google | Sprobuj ponownie pozniej |

---

## Wymagania

- **Node.js** >= 18
- **npm** >= 8
- **Google Cloud Console** - projekt z wlaczonym Search Console API
- **OAuth 2.0 Client ID** - typ Desktop Application (plik JSON)
- **Konto Google** z dostepem do serwisow w Google Search Console
