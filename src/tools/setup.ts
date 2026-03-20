import {
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import type { ToolResult } from "../types.js";

/**
 * Guided onboarding: user provides their Google Cloud app name and email,
 * gets exact step-by-step instructions for configuring that specific app.
 */
export async function setupProject(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["appName", "email"]);
  if (validation) return errorResult(validation);

  const appName = args.appName as string;
  const email = args.email as string;
  const step = (args.step as string) || "check";

  switch (step) {
    case "check":
      return checkWhatToDoNext(appName, email);
    case "enable_api":
      return stepEnableApi(appName);
    case "consent_screen":
      return stepConsentScreen(appName, email);
    case "create_credentials":
      return stepCreateCredentials(appName);
    case "download":
      return stepDownload(appName);
    case "add_to_mcp":
      return stepAddToMcp(appName, email);
    case "full":
    default:
      return fullGuide(appName, email);
  }
}

function checkWhatToDoNext(appName: string, email: string): ToolResult {
  return successResult({
    appName,
    email,
    message: `Sprawdzam co trzeba zrobic dla aplikacji "${appName}" z emailem ${email}.`,
    checklist: [
      {
        step: 1,
        name: "Search Console API",
        action: "Wlacz API w projekcie",
        how: `Otworz: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com`,
        status: "Sprawdz czy jest ENABLED. Jesli nie - kliknij Enable.",
      },
      {
        step: 2,
        name: "OAuth Consent Screen",
        action: "Skonfiguruj ekran zgody",
        how: `Otworz: https://console.cloud.google.com/apis/credentials/consent`,
        status: `Sprawdz czy:
  - User Type = External
  - App name = "${appName}"
  - Scope zawiera: .../auth/webmasters
  - Test users zawiera: ${email}
  ⚠️ NAJCZESCSZY BLAD: email ${email} NIE jest dodany jako Test User!`,
      },
      {
        step: 3,
        name: "OAuth Client ID",
        action: "Stworz credentials typu Desktop App",
        how: `Otworz: https://console.cloud.google.com/apis/credentials`,
        status: "Sprawdz czy istnieje OAuth 2.0 Client ID typu Desktop.",
      },
      {
        step: 4,
        name: "Pobierz JSON",
        action: "Pobierz plik client_secret JSON",
        status: "Pobierz i podaj sciezke do pliku.",
      },
    ],
    quickFix: {
      problem: "Blad 403: access_denied / aplikacja nie przeszla weryfikacji",
      solution: `Email ${email} musi byc dodany jako Test User w OAuth consent screen.`,
      url: "https://console.cloud.google.com/apis/credentials/consent",
      steps: [
        "Otworz powyzszy URL",
        "Upewnij sie ze wybrany jest projekt z aplikacja \"" + appName + "\"",
        "Kliknij EDIT APP (edytuj aplikacje)",
        "Przejdz do kroku 'Test users' (3. krok formularza)",
        `Kliknij ADD USERS i wpisz: ${email}`,
        "Kliknij SAVE AND CONTINUE",
        "Wroc do Claude i sprobuj ponownie refresh_cache",
      ],
    },
    nextAction: `Jesli masz blad 403 - wykonaj kroki z sekcji 'quickFix'. Jesli dopiero zaczynasz - uzyj: setup_project(appName: "${appName}", email: "${email}", step: "full") aby dostac pelny poradnik.`,
  });
}

function stepEnableApi(appName: string): ToolResult {
  return successResult({
    step: "1/5 - Wlaczenie Search Console API",
    appName,
    instructions: [
      `1. Otworz Google Cloud Console: https://console.cloud.google.com`,
      `2. Na gornym pasku upewnij sie ze wybrany jest projekt "${appName}"`,
      `   (jesli nie - kliknij selektor projektu i wybierz "${appName}")`,
      `3. Przejdz do: APIs & Services > Library`,
      `   lub otworz: https://console.cloud.google.com/apis/library`,
      `4. W wyszukiwarce wpisz: Google Search Console API`,
      `5. Kliknij na wynik: "Google Search Console API"`,
      `6. Kliknij ENABLE (Wlacz)`,
      `7. Poczekaj az API sie aktywuje (kilka sekund)`,
    ],
    note: "To jedyne API ktore musisz wlaczyc. Obsluguje: serwisy, mapy witryn, analityke, inspekcje URL, dane strukturalne.",
    nextStep: `Gotowe? Przejdz do: setup_project(appName: "${appName}", email: "TWOJ@EMAIL", step: "consent_screen")`,
  });
}

function stepConsentScreen(appName: string, email: string): ToolResult {
  return successResult({
    step: "2/5 - Konfiguracja OAuth Consent Screen",
    appName,
    email,
    warning: "⚠️ TO JEST NAJWAZNIEJSZY KROK. Wiekszosc bledow 403 wynika z blednej konfiguracji tego ekranu.",
    instructions: [
      `1. Otworz: https://console.cloud.google.com/apis/credentials/consent`,
      `2. Upewnij sie ze wybrany jest projekt "${appName}"`,
      "",
      "--- JESLI CONSENT SCREEN JESZCZE NIE ISTNIEJE ---",
      `3. Wybierz User Type: External → kliknij CREATE`,
      `4. Wypelnij formularz:`,
      `   App name: ${appName}`,
      `   User support email: ${email}`,
      `   Developer contact: ${email}`,
      `5. Kliknij SAVE AND CONTINUE`,
      "",
      "--- SCOPES (zakres) ---",
      `6. Kliknij ADD OR REMOVE SCOPES`,
      `7. W filtrze wpisz: webmasters`,
      `8. Zaznacz: Google Search Console API → .../auth/webmasters`,
      `   (lub wpisz recznie: https://www.googleapis.com/auth/webmasters)`,
      `9. Kliknij UPDATE`,
      `10. Kliknij SAVE AND CONTINUE`,
      "",
      "--- TEST USERS (⚠️ KRYTYCZNE!) ---",
      `11. Kliknij ADD USERS`,
      `12. Wpisz dokladnie: ${email}`,
      `13. Kliknij ADD`,
      `14. Kliknij SAVE AND CONTINUE`,
      "",
      "--- JESLI CONSENT SCREEN JUZ ISTNIEJE (edycja) ---",
      `15. Kliknij EDIT APP`,
      `16. Przejdz przez formularze az do Test Users`,
      `17. Sprawdz czy ${email} jest na liscie`,
      `18. Jesli nie ma - dodaj i zapisz`,
    ],
    commonErrors: {
      "403_access_denied": `Email ${email} NIE jest dodany jako Test User. Dodaj go w kroku 11-13.`,
      "403_app_not_verified": `To normalne dla aplikacji w trybie Testing. Wystarczy dodac email jako Test User.`,
      "scope_missing": "Jesli pozniej dostajesz blad 'insufficient permissions' - wroc tutaj i sprawdz scopes (krok 6-9).",
    },
    nextStep: `Gotowe? Przejdz do: setup_project(appName: "${appName}", email: "${email}", step: "create_credentials")`,
  });
}

function stepCreateCredentials(appName: string): ToolResult {
  return successResult({
    step: "3/5 - Tworzenie OAuth Client ID",
    appName,
    instructions: [
      `1. Otworz: https://console.cloud.google.com/apis/credentials`,
      `2. Upewnij sie ze wybrany jest projekt "${appName}"`,
      `3. Kliknij + CREATE CREDENTIALS na gorze strony`,
      `4. Wybierz: OAuth client ID`,
      `5. Application type: ⚠️ MUSI byc: Desktop app`,
      `   (NIE Web application, NIE Service account)`,
      `6. Name: ${appName}-mcp (lub dowolna nazwa)`,
      `7. Kliknij CREATE`,
      "",
      "Pojawi sie okno z Client ID i Client Secret.",
      "Nie musisz nic kopiowac - za chwile pobierzesz caly plik JSON.",
    ],
    criticalNote: "Typ MUSI byc 'Desktop app'. Jesli wybierzesz 'Web application' - plik JSON bedzie mial sekcje 'web' zamiast 'installed' i MCP nie zadziala.",
    nextStep: `Gotowe? Przejdz do: setup_project(appName: "${appName}", email: "", step: "download")`,
  });
}

function stepDownload(appName: string): ToolResult {
  return successResult({
    step: "4/5 - Pobranie pliku credentials JSON",
    appName,
    instructions: [
      `1. Na stronie https://console.cloud.google.com/apis/credentials`,
      `2. W sekcji "OAuth 2.0 Client IDs" znajdz swoj Client ID`,
      `3. Kliknij ikone POBIERANIA (strzalka w dol) po prawej stronie`,
      `   lub kliknij na nazwe → potem DOWNLOAD JSON`,
      `4. Zapisz plik w bezpiecznym miejscu, np.:`,
      `   macOS:   ~/gsc-credentials/${appName}-client-secret.json`,
      `   Windows: C:\\gsc-credentials\\${appName}-client-secret.json`,
      `   Linux:   ~/gsc-credentials/${appName}-client-secret.json`,
    ],
    fileCheck: {
      correct: 'Plik powinien miec sekcje "installed" (z polami client_id, client_secret)',
      wrong: 'Jesli plik ma sekcje "web" zamiast "installed" - wybrales zly typ (Web application). Usun credentials i stworz nowe jako Desktop app.',
    },
    nextStep: `Gotowe? Podaj mi sciezke do pliku, a ja wykonam add_account za Ciebie.`,
  });
}

function stepAddToMcp(appName: string, email: string): ToolResult {
  return successResult({
    step: "5/5 - Dodanie do MCP",
    appName,
    email,
    instructions: [
      `Teraz uzyj narzedzia add_account:`,
      "",
      `add_account(`,
      `  name: "${appName}",`,
      `  email: "${email}",`,
      `  clientSecretPath: "/SCIEZKA/DO/${appName}-client-secret.json"`,
      `)`,
      "",
      "Potem:",
      "  refresh_cache()     ← przegladarka otworzy sie do logowania",
      `  Zaloguj sie kontem: ${email}`,
      "  Zatwierdz dostep",
      "  list_sites()        ← powinno pokazac serwisy GSC",
    ],
    troubleshooting: {
      "403_access_denied": [
        `1. Otworz: https://console.cloud.google.com/apis/credentials/consent`,
        `2. Upewnij sie ze wybrany jest projekt "${appName}"`,
        `3. Kliknij EDIT APP`,
        `4. Przejdz do Test Users`,
        `5. Dodaj: ${email}`,
        `6. Zapisz`,
        `7. W Claude: reset_account_auth() i potem refresh_cache()`,
      ],
      "invalid_client": [
        "Plik credentials jest nieprawidlowy.",
        "Sprawdz czy pobrales wlasciwy plik (Desktop app, nie Web application).",
        "Sprobuj pobrac ponownie z Google Cloud Console.",
      ],
    },
  });
}

function fullGuide(appName: string, email: string): ToolResult {
  return successResult({
    title: `Pelny poradnik konfiguracji: "${appName}"`,
    appName,
    email,
    overview: `Konfiguracja aplikacji "${appName}" dla konta ${email} w 5 krokach:`,
    steps: [
      {
        step: "1/5",
        name: "Wlacz Search Console API",
        url: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
        actions: [
          `Otworz URL powyzej`,
          `Upewnij sie ze wybrany jest projekt "${appName}"`,
          "Kliknij ENABLE",
        ],
      },
      {
        step: "2/5",
        name: "Skonfiguruj OAuth Consent Screen",
        url: "https://console.cloud.google.com/apis/credentials/consent",
        actions: [
          "User Type: External → CREATE",
          `App name: ${appName}`,
          `User support email: ${email}`,
          `Developer contact: ${email}`,
          "SAVE AND CONTINUE",
          "Scopes: dodaj .../auth/webmasters → UPDATE → SAVE AND CONTINUE",
          `⚠️ Test users: ADD USERS → wpisz ${email} → ADD → SAVE AND CONTINUE`,
        ],
        criticalWarning: `Email ${email} MUSI byc dodany jako Test User! Bez tego dostaniesz blad 403.`,
      },
      {
        step: "3/5",
        name: "Stworz OAuth Client ID",
        url: "https://console.cloud.google.com/apis/credentials",
        actions: [
          "+ CREATE CREDENTIALS → OAuth client ID",
          "Application type: Desktop app",
          `Name: ${appName}-mcp`,
          "CREATE",
        ],
      },
      {
        step: "4/5",
        name: "Pobierz plik JSON",
        actions: [
          "Na liscie OAuth 2.0 Client IDs → ikona pobierania",
          `Zapisz jako: ~/gsc-credentials/${appName}-client-secret.json`,
          'Sprawdz czy plik ma sekcje "installed" (nie "web")',
        ],
      },
      {
        step: "5/5",
        name: "Dodaj do MCP",
        actions: [
          `add_account(name: "${appName}", email: "${email}", clientSecretPath: "/SCIEZKA/DO/${appName}-client-secret.json")`,
          "refresh_cache()  ← przegladarka otworzy sie, zaloguj sie i zatwierdz",
          "list_sites()     ← gotowe!",
        ],
      },
    ],
    afterSetup: {
      testCommand: "list_sites()",
      expectedResult: "Lista serwisow GSC dostepnych z konta " + email,
    },
  });
}
