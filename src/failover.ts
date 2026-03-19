import { loadConfig, getAccountEmail, getAccountsByEmail } from "./accounts.js";
import { findAccountsForSite } from "./cache.js";
import { getSearchConsoleService } from "./auth.js";
import type { searchconsole_v1 } from "googleapis";

// Track which accounts are rate-limited and when they can be retried
const rateLimitedAccounts = new Map<string, number>(); // accountId -> expiry timestamp

const RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 60s cooldown after 429

/**
 * Check if an error is a rate limit (429) or quota error.
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as any;
    if (err.response?.status === 429) return true;
    if (err.code === 429) return true;
    if (err.status === 429) return true;
    if (err.errors?.[0]?.reason === "rateLimitExceeded") return true;
    if (err.errors?.[0]?.reason === "userRateLimitExceeded") return true;
    if (
      err.message?.includes("429") ||
      err.message?.includes("Rate Limit") ||
      err.message?.includes("rateLimitExceeded") ||
      err.message?.includes("Quota exceeded")
    )
      return true;
  }
  return false;
}

export function markRateLimited(accountId: string): void {
  rateLimitedAccounts.set(accountId, Date.now() + RATE_LIMIT_COOLDOWN_MS);
  const email = getAccountEmail(accountId);
  console.error(
    `[HeySEO GSC] Account "${accountId}" (${email}) hit rate limit. Cooldown ${RATE_LIMIT_COOLDOWN_MS / 1000}s.`
  );
}

export function isAccountRateLimited(accountId: string): boolean {
  const expiresAt = rateLimitedAccounts.get(accountId);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    rateLimitedAccounts.delete(accountId);
    return false;
  }
  return true;
}

/**
 * Build ordered list of accounts to try for failover.
 *
 * Priority order:
 *   1. Primary account (requested or active)
 *   2. Other projects under the SAME EMAIL that have access to this site (from cache)
 *   3. Other projects under the SAME EMAIL (any, even if not in cache for this site)
 *   4. Projects under OTHER EMAILS that have access to this site (from cache)
 *   5. All remaining projects under other emails
 *
 * Rate-limited accounts are skipped (added at the very end as last resort).
 */
export function buildFailoverOrder(
  primaryAccountId: string | undefined,
  siteUrl: string | undefined
): string[] {
  const config = loadConfig();
  const primary = primaryAccountId || config.activeAccountId;
  const primaryEmail = primary ? getAccountEmail(primary) : null;
  const byEmail = getAccountsByEmail();
  const accountsWithSite = siteUrl ? new Set(findAccountsForSite(siteUrl)) : new Set<string>();

  const order: string[] = [];
  const rateLimitedFallback: string[] = [];

  function tryAdd(accId: string): void {
    if (order.includes(accId) || rateLimitedFallback.includes(accId)) return;
    if (isAccountRateLimited(accId)) {
      rateLimitedFallback.push(accId);
    } else {
      order.push(accId);
    }
  }

  // 1. Primary account
  if (primary) {
    tryAdd(primary);
  }

  // 2. Same email — projects with access to this site
  if (primaryEmail) {
    const sameEmailAccounts = byEmail.get(primaryEmail) || [];
    for (const accId of sameEmailAccounts) {
      if (accountsWithSite.has(accId)) {
        tryAdd(accId);
      }
    }

    // 3. Same email — all remaining projects
    for (const accId of sameEmailAccounts) {
      tryAdd(accId);
    }
  }

  // 4. Other emails — projects with access to this site
  for (const [email, accountIds] of byEmail) {
    if (email === primaryEmail) continue;
    for (const accId of accountIds) {
      if (accountsWithSite.has(accId)) {
        tryAdd(accId);
      }
    }
  }

  // 5. Other emails — all remaining projects
  for (const [email, accountIds] of byEmail) {
    if (email === primaryEmail) continue;
    for (const accId of accountIds) {
      tryAdd(accId);
    }
  }

  // 6. Rate-limited accounts as absolute last resort
  for (const accId of rateLimitedFallback) {
    if (!order.includes(accId)) {
      order.push(accId);
    }
  }

  return order;
}

/**
 * Find an alternative account using the same priority logic.
 * Used by searchAnalytics for mid-pagination failover.
 */
export function findAlternativeAccount(
  siteUrl: string,
  excludeAccountId: string
): string | null {
  const order = buildFailoverOrder(excludeAccountId, siteUrl);
  for (const accId of order) {
    if (accId !== excludeAccountId && !isAccountRateLimited(accId)) {
      return accId;
    }
  }
  return null;
}

/**
 * Execute an API call with automatic failover on rate limit.
 *
 * Failover order:
 *   1. Same email, other projects with site access
 *   2. Same email, other projects
 *   3. Other emails, projects with site access
 *   4. Other emails, remaining projects
 */
export async function executeWithFailover<T>(
  primaryAccountId: string | undefined,
  siteUrl: string | undefined,
  apiCall: (service: searchconsole_v1.Searchconsole, accountId: string) => Promise<T>
): Promise<{ result: T; usedAccountId: string }> {
  const accountOrder = buildFailoverOrder(primaryAccountId, siteUrl);

  if (accountOrder.length === 0) {
    throw new Error(
      "No accounts available. Add accounts with add_account first."
    );
  }

  let lastError: unknown;

  for (const accountId of accountOrder) {
    try {
      const service = await getSearchConsoleService(accountId);
      const result = await apiCall(service, accountId);

      const primary = primaryAccountId || loadConfig().activeAccountId;
      if (accountId !== primary) {
        const email = getAccountEmail(accountId);
        console.error(
          `[HeySEO GSC] Failover: used "${accountId}" (${email}) instead of "${primary}".`
        );
      }

      return { result, usedAccountId: accountId };
    } catch (error) {
      if (isRateLimitError(error)) {
        markRateLimited(accountId);
        lastError = error;
        const email = getAccountEmail(accountId);
        console.error(
          `[HeySEO GSC] Rate limit on "${accountId}" (${email}). Trying next...`
        );
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `All ${accountOrder.length} accounts exhausted (rate-limited). ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. ` +
      `Wait a moment or add more accounts/projects.`
  );
}
