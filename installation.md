# Instalacja HeySEO MCP Google Search Console

Poradnik instalacji MCP z repozytorium GitHub. Obsluguje Claude Desktop, Claude Code i inne klienty MCP.

## Spis tresci

- [Wymagania systemowe](#wymagania-systemowe)
- [Szybka instalacja](#szybka-instalacja)
- [Konfiguracja dla Claude Desktop](#konfiguracja-dla-claude-desktop)
- [Konfiguracja dla Claude Code](#konfiguracja-dla-claude-code)
- [Pierwszy start](#pierwszy-start)
- [Aktualizacja](#aktualizacja)
- [Odinstalowanie](#odinstalowanie)
- [Rozwiazywanie problemow instalacji](#rozwiazywanie-problemow-instalacji)

---

## Wymagania systemowe

| Wymaganie | Minimalna wersja | Sprawdzenie |
|-----------|-----------------|-------------|
| **Node.js** | 18.0+ | `node --version` |
| **npm** | 8.0+ | `npm --version` |
| **Git** | 2.0+ | `git --version` |
| **System** | macOS, Linux, Windows | - |

### Instalacja Node.js (jesli nie masz)

**macOS (Homebrew):**
```bash
brew install node
```

**macOS / Windows / Linux (oficjalny installer):**
- https://nodejs.org/ → pobierz wersje LTS

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Szybka instalacja

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/TwojUser/heyseo-mcp-google-search-console.git
cd heyseo-mcp-google-search-console
```

> **Tip:** Mozesz sklonowac do dowolnego folderu. Dobrze sprawdza sie np.:
> - macOS/Linux: `~/mcp-servers/heyseo-gsc/`
> - Windows: `C:\mcp-servers\heyseo-gsc\`

### 2. Zainstaluj zaleznosci

```bash
npm install
```

Zainstaluje:
- `@modelcontextprotocol/sdk` - MCP SDK
- `googleapis` - Google APIs client
- `google-auth-library` - OAuth 2.0
- `open` - otwieranie przegladarki
- `typescript` - kompilator (dev)

### 3. Zbuduj projekt

```bash
npm run build
```

Kompiluje TypeScript → JavaScript do folderu `dist/`.

### 4. Sprawdz czy build sie powiodl

```bash
ls dist/index.js
```

Powinien istniec plik `dist/index.js`.

---

## Konfiguracja dla Claude Desktop

### Lokalizacja pliku konfiguracyjnego

| System | Sciezka |
|--------|---------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

### Edytuj konfiguracje

Otworz plik i dodaj sekcje `heyseo-gsc` w `mcpServers`:

```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["/PELNA/SCIEZKA/DO/heyseo-mcp-google-search-console/dist/index.js"]
    }
  }
}
```

### Przyklady sciezek

**macOS:**
```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["/Users/jan/mcp-servers/heyseo-mcp-google-search-console/dist/index.js"]
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["C:\\mcp-servers\\heyseo-mcp-google-search-console\\dist\\index.js"]
    }
  }
}
```

**Linux:**
```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["/home/jan/mcp-servers/heyseo-mcp-google-search-console/dist/index.js"]
    }
  }
}
```

### Wazne

- Sciezka musi byc **absolutna** (pelna), nie wzgledna
- Na Windows uzyj podwojnych backslashy `\\` lub forwardslashy `/`
- **Zrestartuj Claude Desktop** po zmianie konfiguracji

---

## Konfiguracja dla Claude Code

### Opcja A: Settings.json (globalna)

Edytuj `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["/PELNA/SCIEZKA/DO/heyseo-mcp-google-search-console/dist/index.js"]
    }
  }
}
```

### Opcja B: Per-projekt (.claude/settings.json)

W katalogu projektu stworz `.claude/settings.json`:

```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node",
      "args": ["/PELNA/SCIEZKA/DO/heyseo-mcp-google-search-console/dist/index.js"]
    }
  }
}
```

### Po dodaniu

Zrestartuj Claude Code lub uzyj `/mcp` aby zobaczyc czy serwer jest podlaczony.

---

## Pierwszy start

Po skonfigurowaniu MCP i zrestartowaniu Claude:

### 1. Sprawdz czy MCP dziala

W Claude napisz:
```
list_accounts
```

Powinno zwrocic pusta liste kont (jesli jeszcze nie dodales).

### 2. Przygotuj credentials Google Cloud

Jesli jeszcze nie masz - przeczytaj **[gsc-project.md](gsc-project.md)** aby:
1. Stworzyc projekt w Google Cloud Console
2. Wlaczyc Search Console API
3. Skonfigurowac OAuth Consent Screen
4. Stworzyc OAuth Client ID (Desktop App)
5. Pobrac plik JSON credentials

### 3. Dodaj konto

```
add_account(
  name: "Moje konto",
  email: "moj@email.com",
  clientSecretPath: "/sciezka/do/client_secret.json"
)
```

### 4. Odswiez cache (pierwsze logowanie)

```
refresh_cache
```

**Przegladarka otworzy sie automatycznie.** Zaloguj sie kontem Google i zatwierdz dostep.

### 5. Sprawdz serwisy

```
list_sites
```

Powinno pokazac wszystkie serwisy GSC dostepne z Twojego konta Google.

### 6. Gotowe!

Mozesz teraz uzywac wszystkich 22 narzedzi MCP.

---

## Aktualizacja

### Z repozytorium GitHub

```bash
cd /sciezka/do/heyseo-mcp-google-search-console

# Pobierz zmiany
git pull origin main

# Przeinstaluj zaleznosci (jesli zmienily sie)
npm install

# Przebuduj
npm run build
```

### Po aktualizacji

- **Zrestartuj Claude Desktop** lub **Claude Code**
- Twoje konta, tokeny i cache sa bezpieczne w `~/.heyseo-gsc/` - nie zostana nadpisane
- Nie musisz ponownie logowac sie przez przegladarke

---

## Odinstalowanie

### 1. Usun konfiguracje MCP

Edytuj `claude_desktop_config.json` (lub `settings.json`) i usun sekcje `heyseo-gsc`.

### 2. Usun kod zrodlowy

```bash
rm -rf /sciezka/do/heyseo-mcp-google-search-console
```

### 3. Usun dane konfiguracyjne (opcjonalnie)

```bash
rm -rf ~/.heyseo-gsc
```

> **Uwaga:** To usunie tokeny OAuth, cache i konfiguracje kont. Credentials OAuth Client ID w Google Cloud Console pozostana - mozesz je usunac recznie w konsoli Google.

---

## Rozwiazywanie problemow instalacji

### "command not found: node"

Node.js nie jest zainstalowany lub nie jest w PATH.

**Rozwiazanie:** Zainstaluj Node.js (patrz [Wymagania systemowe](#wymagania-systemowe)).

**macOS z nvm:**
```bash
# Jesli uzywasz nvm, uzyj pelnej sciezki w konfiguracji MCP
which node
# np. /Users/jan/.nvm/versions/node/v20.11.0/bin/node
```

Wtedy w konfiguracji MCP uzyj pelnej sciezki do node:
```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "/Users/jan/.nvm/versions/node/v20.11.0/bin/node",
      "args": ["/sciezka/do/dist/index.js"]
    }
  }
}
```

### "Cannot find module" / build errors

```bash
# Wyczysc i przeinstaluj
rm -rf node_modules dist
npm install
npm run build
```

### "EACCES: permission denied" (Linux/macOS)

```bash
# Nie uzywaj sudo z npm! Zamiast tego napraw uprawnienia:
sudo chown -R $(whoami) ~/.npm
npm install
```

### MCP nie pojawia sie w Claude

1. Sprawdz czy sciezka w konfiguracji jest absolutna i poprawna
2. Sprawdz czy `dist/index.js` istnieje (`ls dist/index.js`)
3. Sprawdz logi Claude Desktop:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`
4. Zrestartuj Claude Desktop / Claude Code

### "Error: Cannot find module '@modelcontextprotocol/sdk'"

```bash
# Upewnij sie ze jestes w katalogu projektu
cd /sciezka/do/heyseo-mcp-google-search-console
npm install
npm run build
```

### Serwer MCP startuje ale nie odpowiada

Sprawdz logi stderr serwera. MCP komunikuje sie przez stdio - wszelkie logi diagnostyczne ida na stderr:

```bash
# Test reczny
echo '{}' | node /sciezka/do/dist/index.js 2>stderr.log
cat stderr.log
```

### Windows: "Error: spawn ENOENT"

Na Windows moze byc potrzebne:
```json
{
  "mcpServers": {
    "heyseo-gsc": {
      "command": "node.exe",
      "args": ["C:\\sciezka\\do\\dist\\index.js"]
    }
  }
}
```

Lub uzyj pelnej sciezki do node:
```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe"
}
```
