import { OAuth2Client } from "google-auth-library";
import { google, searchconsole_v1 } from "googleapis";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { resolveAccount, type AccountConfig } from "./accounts.js";

const SCOPES = ["https://www.googleapis.com/auth/webmasters"];

// Cache per account ID
const serviceCache = new Map<string, searchconsole_v1.Searchconsole>();
const authCache = new Map<string, OAuth2Client>();

function loadClientSecrets(secretPath: string): {
  client_id: string;
  client_secret: string;
} {
  if (!fs.existsSync(secretPath)) {
    throw new Error(
      `OAuth client secret file not found at: ${secretPath}. ` +
        "Download it from Google Cloud Console > APIs & Services > Credentials."
    );
  }

  const content = JSON.parse(fs.readFileSync(secretPath, "utf-8"));
  const credentials = content.installed || content.web || content;

  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error(
      "Invalid OAuth client secret file. Expected 'installed' or 'web' credentials with client_id and client_secret."
    );
  }

  return credentials;
}

function saveToken(tokenPath: string, token: object): void {
  const tokenDir = path.dirname(tokenPath);
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

function loadSavedToken(tokenPath: string): object | null {
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
  } catch {
    return null;
  }
}

interface AuthCodeResult {
  code: string;
  redirectUri: string;
}

async function getAuthCodeViaLocalServer(
  clientId: string,
  clientSecret: string
): Promise<AuthCodeResult> {
  const open = (await import("open")).default;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "", `http://localhost`);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<html><body><h1>Autoryzacja odrzucona</h1><p>Błąd: ${error}</p><p>Możesz zamknąć to okno.</p></body></html>`
          );
          server.close();
          reject(new Error(`Authorization denied: ${error}`));
          return;
        }

        if (code) {
          const address = server.address();
          const port =
            address && typeof address !== "string" ? address.port : 0;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<html><body><h1>HeySEO GSC - Autoryzacja zakończona!</h1><p>Token został zapisany. Możesz zamknąć to okno i wrócić do aplikacji.</p></body></html>`
          );
          server.close();
          resolve({ code, redirectUri: `http://127.0.0.1:${port}` });
          return;
        }

        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing authorization code");
        server.close();
        reject(new Error("Missing authorization code in callback"));
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to start local HTTP server"));
        return;
      }

      const port = address.port;
      const redirectUri = `http://127.0.0.1:${port}`;
      const tempClient = new OAuth2Client(clientId, clientSecret, redirectUri);
      const authUrl = tempClient.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
      });

      console.error(
        `\n[HeySEO GSC] Otwieranie przeglądarki do autoryzacji Google...\n` +
          `Jeśli przeglądarka się nie otworzy, skopiuj ten URL:\n${authUrl}\n`
      );

      open(authUrl).catch(() => {
        console.error(
          `[HeySEO GSC] Nie udało się otworzyć przeglądarki. Otwórz ręcznie:\n${authUrl}`
        );
      });
    });

    server.on("error", (err) => {
      reject(
        new Error(`Failed to start local callback server: ${err.message}`)
      );
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

async function authorizeAccount(account: AccountConfig): Promise<OAuth2Client> {
  // Check cache
  const cached = authCache.get(account.id);
  if (cached) return cached;

  const credentials = loadClientSecrets(account.clientSecretPath);

  const oAuth2Client = new OAuth2Client(
    credentials.client_id,
    credentials.client_secret
  );

  // Try saved token
  const savedToken = loadSavedToken(account.tokenPath);
  if (savedToken) {
    oAuth2Client.setCredentials(savedToken as any);

    try {
      const tokenInfo = oAuth2Client.credentials;
      if (
        tokenInfo.expiry_date &&
        tokenInfo.expiry_date < Date.now() + 60000
      ) {
        const { credentials: refreshed } =
          await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(refreshed);
        saveToken(account.tokenPath, refreshed);
      }
      authCache.set(account.id, oAuth2Client);
      return oAuth2Client;
    } catch {
      console.error(
        `[HeySEO GSC] Token for account "${account.name}" is invalid. Starting new authorization flow...`
      );
    }
  }

  // OAuth flow
  const { code, redirectUri } = await getAuthCodeViaLocalServer(
    credentials.client_id,
    credentials.client_secret
  );

  const authClient = new OAuth2Client(
    credentials.client_id,
    credentials.client_secret,
    redirectUri
  );
  const { tokens } = await authClient.getToken(code);
  authClient.setCredentials(tokens);
  saveToken(account.tokenPath, tokens);

  authCache.set(account.id, authClient);
  return authClient;
}

export async function getSearchConsoleService(
  accountId?: string
): Promise<searchconsole_v1.Searchconsole> {
  const account = resolveAccount(accountId);

  const cached = serviceCache.get(account.id);
  if (cached) return cached;

  const auth = await authorizeAccount(account);
  const service = google.searchconsole({ version: "v1", auth });
  serviceCache.set(account.id, service);
  return service;
}

export function clearAccountCache(accountId: string): void {
  serviceCache.delete(accountId);
  authCache.delete(accountId);
}

export function clearAllCaches(): void {
  serviceCache.clear();
  authCache.clear();
}
