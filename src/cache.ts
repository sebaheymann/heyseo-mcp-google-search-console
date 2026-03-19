import * as fs from "node:fs";
import * as path from "node:path";
import { HEYSEO_DIR, loadConfig, type AccountConfig } from "./accounts.js";
import { getSearchConsoleService } from "./auth.js";

const CACHE_DIR = path.join(HEYSEO_DIR, "cache");
const SITES_CACHE_FILE = path.join(CACHE_DIR, "sites.json");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CachedSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface AccountSitesEntry {
  accountId: string;
  accountName: string;
  sites: CachedSite[];
  lastUpdated: string;
}

export interface SitesCache {
  lastFullRefresh: string | null;
  accounts: AccountSitesEntry[];
}

// ─── Cache I/O ──────────────────────────────────────────────────────────────

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function loadSitesCache(): SitesCache {
  ensureCacheDir();
  if (!fs.existsSync(SITES_CACHE_FILE)) {
    return { lastFullRefresh: null, accounts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(SITES_CACHE_FILE, "utf-8"));
  } catch {
    return { lastFullRefresh: null, accounts: [] };
  }
}

export function saveSitesCache(cache: SitesCache): void {
  ensureCacheDir();
  fs.writeFileSync(SITES_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ─── Refresh ────────────────────────────────────────────────────────────────

/**
 * Refresh sites cache for a single account by calling the GSC API.
 */
export async function refreshAccountSites(
  accountId: string
): Promise<AccountSitesEntry> {
  const service = await getSearchConsoleService(accountId);
  const response = await service.sites.list();
  const sites: CachedSite[] = (response.data.siteEntry || []).map((s) => ({
    siteUrl: s.siteUrl || "",
    permissionLevel: s.permissionLevel || "UNKNOWN",
  }));

  const config = loadConfig();
  const account = config.accounts.find((a) => a.id === accountId);

  const entry: AccountSitesEntry = {
    accountId,
    accountName: account?.name || accountId,
    sites,
    lastUpdated: new Date().toISOString(),
  };

  // Update cache
  const cache = loadSitesCache();
  const idx = cache.accounts.findIndex((a) => a.accountId === accountId);
  if (idx >= 0) {
    cache.accounts[idx] = entry;
  } else {
    cache.accounts.push(entry);
  }
  saveSitesCache(cache);

  return entry;
}

/**
 * Refresh sites cache for ALL configured accounts.
 */
export async function refreshAllSites(): Promise<SitesCache> {
  const config = loadConfig();
  const cache = loadSitesCache();
  const errors: Array<{ accountId: string; error: string }> = [];

  for (const account of config.accounts) {
    try {
      const entry = await refreshAccountSites(account.id);
      const idx = cache.accounts.findIndex(
        (a) => a.accountId === account.id
      );
      if (idx >= 0) {
        cache.accounts[idx] = entry;
      } else {
        cache.accounts.push(entry);
      }
    } catch (err) {
      errors.push({
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Remove accounts that no longer exist in config
  const configIds = new Set(config.accounts.map((a) => a.id));
  cache.accounts = cache.accounts.filter((a) => configIds.has(a.accountId));

  cache.lastFullRefresh = new Date().toISOString();
  saveSitesCache(cache);

  if (errors.length > 0) {
    console.error(
      `[HeySEO GSC] Cache refresh errors: ${JSON.stringify(errors)}`
    );
  }

  return cache;
}

// ─── Cache Reads ────────────────────────────────────────────────────────────

/**
 * Get all sites from cache. Returns null if cache is empty (needs refresh).
 */
export function getCachedSites(): SitesCache | null {
  const cache = loadSitesCache();
  if (!cache.lastFullRefresh || cache.accounts.length === 0) {
    return null;
  }
  return cache;
}

/**
 * Get cached sites for a specific account.
 */
export function getCachedAccountSites(
  accountId: string
): AccountSitesEntry | null {
  const cache = loadSitesCache();
  return cache.accounts.find((a) => a.accountId === accountId) || null;
}

/**
 * Find which accounts have access to a specific siteUrl.
 * Returns list of account IDs that have this site.
 */
export function findAccountsForSite(siteUrl: string): string[] {
  const cache = loadSitesCache();
  return cache.accounts
    .filter((a) => a.sites.some((s) => s.siteUrl === siteUrl))
    .map((a) => a.accountId);
}

/**
 * Get a flat list of all unique sites across all accounts.
 */
export function getAllCachedSitesFlat(): Array<{
  siteUrl: string;
  permissionLevel: string;
  accounts: string[];
}> {
  const cache = loadSitesCache();
  const siteMap = new Map<
    string,
    { siteUrl: string; permissionLevel: string; accounts: string[] }
  >();

  for (const entry of cache.accounts) {
    for (const site of entry.sites) {
      const existing = siteMap.get(site.siteUrl);
      if (existing) {
        existing.accounts.push(entry.accountId);
        // Keep highest permission level
        if (
          site.permissionLevel === "siteOwner" ||
          site.permissionLevel === "siteFullUser"
        ) {
          existing.permissionLevel = site.permissionLevel;
        }
      } else {
        siteMap.set(site.siteUrl, {
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
          accounts: [entry.accountId],
        });
      }
    }
  }

  return Array.from(siteMap.values());
}
