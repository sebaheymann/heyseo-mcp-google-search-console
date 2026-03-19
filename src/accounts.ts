import * as fs from "node:fs";
import * as path from "node:path";

export const HEYSEO_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".heyseo-gsc"
);

const CONFIG_PATH = path.join(HEYSEO_DIR, "config.json");

export interface AccountConfig {
  id: string;
  name: string;
  email: string; // Google account email - groups projects under same email
  clientSecretPath: string;
  tokenPath: string;
}

export interface AppConfig {
  activeAccountId: string | null;
  accounts: AccountConfig[];
}

function ensureDir(): void {
  if (!fs.existsSync(HEYSEO_DIR)) {
    fs.mkdirSync(HEYSEO_DIR, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return { activeAccountId: null, accounts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { activeAccountId: null, accounts: [] };
  }
}

export function saveConfig(config: AppConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function addAccount(
  name: string,
  email: string,
  clientSecretPath: string
): AccountConfig {
  const config = loadConfig();

  if (!email || !email.includes("@")) {
    throw new Error("A valid Google account email is required (e.g. user@gmail.com).");
  }

  // Validate client secret file exists
  if (!fs.existsSync(clientSecretPath)) {
    throw new Error(`Client secret file not found: ${clientSecretPath}`);
  }

  // Validate it's a valid JSON with client_id
  try {
    const content = JSON.parse(fs.readFileSync(clientSecretPath, "utf-8"));
    const creds = content.installed || content.web || content;
    if (!creds.client_id || !creds.client_secret) {
      throw new Error("Missing client_id or client_secret");
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in client secret file: ${clientSecretPath}`
      );
    }
    throw err;
  }

  const id = sanitizeId(name);
  if (!id) {
    throw new Error("Account name must contain at least one alphanumeric character.");
  }

  // Check for duplicate
  if (config.accounts.some((a) => a.id === id)) {
    throw new Error(
      `Account with ID "${id}" already exists. Use a different name.`
    );
  }

  // Copy client secret to heyseo dir for portability
  const destSecretPath = path.join(HEYSEO_DIR, `client_secret_${id}.json`);
  fs.copyFileSync(clientSecretPath, destSecretPath);

  const account: AccountConfig = {
    id,
    name,
    email: email.toLowerCase().trim(),
    clientSecretPath: destSecretPath,
    tokenPath: path.join(HEYSEO_DIR, `token_${id}.json`),
  };

  config.accounts.push(account);

  // Auto-set as active if first account
  if (!config.activeAccountId) {
    config.activeAccountId = id;
  }

  saveConfig(config);
  return account;
}

/**
 * Get the email for an account by its ID.
 */
export function getAccountEmail(accountId: string): string | null {
  const config = loadConfig();
  const account = config.accounts.find((a) => a.id === accountId);
  return account?.email || null;
}

/**
 * Get all accounts grouped by email.
 * Returns Map<email, accountId[]>
 */
export function getAccountsByEmail(): Map<string, string[]> {
  const config = loadConfig();
  const map = new Map<string, string[]>();
  for (const acc of config.accounts) {
    const list = map.get(acc.email) || [];
    list.push(acc.id);
    map.set(acc.email, list);
  }
  return map;
}

export function removeAccount(accountId: string): void {
  const config = loadConfig();
  const idx = config.accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) {
    throw new Error(`Account "${accountId}" not found.`);
  }

  const account = config.accounts[idx];

  // Remove token file if exists
  if (fs.existsSync(account.tokenPath)) {
    fs.unlinkSync(account.tokenPath);
  }

  // Remove copied client secret
  if (
    account.clientSecretPath.startsWith(HEYSEO_DIR) &&
    fs.existsSync(account.clientSecretPath)
  ) {
    fs.unlinkSync(account.clientSecretPath);
  }

  config.accounts.splice(idx, 1);

  // Reset active if it was the removed account
  if (config.activeAccountId === accountId) {
    config.activeAccountId =
      config.accounts.length > 0 ? config.accounts[0].id : null;
  }

  saveConfig(config);
}

export function switchAccount(accountId: string): AccountConfig {
  const config = loadConfig();
  const account = config.accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(
      `Account "${accountId}" not found. Available: ${config.accounts.map((a) => a.id).join(", ") || "(none)"}`
    );
  }

  config.activeAccountId = accountId;
  saveConfig(config);
  return account;
}

export function getActiveAccount(): AccountConfig | null {
  const config = loadConfig();
  if (!config.activeAccountId) return null;
  return (
    config.accounts.find((a) => a.id === config.activeAccountId) || null
  );
}

export function getAccountById(accountId: string): AccountConfig | null {
  const config = loadConfig();
  return config.accounts.find((a) => a.id === accountId) || null;
}

export function resolveAccount(
  accountId?: string
): AccountConfig {
  if (accountId) {
    const account = getAccountById(accountId);
    if (!account) {
      throw new Error(
        `Account "${accountId}" not found. Use list_accounts to see available accounts.`
      );
    }
    return account;
  }

  const active = getActiveAccount();
  if (!active) {
    throw new Error(
      "No active account. Use add_account to add a Google account first, or switch_account to activate one."
    );
  }
  return active;
}
