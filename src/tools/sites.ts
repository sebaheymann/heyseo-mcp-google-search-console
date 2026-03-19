import { executeWithFailover } from "../failover.js";
import {
  formatError,
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import {
  getCachedSites,
  getCachedAccountSites,
  getAllCachedSitesFlat,
} from "../cache.js";
import type { ToolResult } from "../types.js";

/**
 * List sites from LOCAL CACHE (no API call). Returns cached data.
 * Use refresh_cache to update the cache.
 */
export async function listSites(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const accountId = args.accountId as string | undefined;

    if (accountId) {
      const cached = getCachedAccountSites(accountId);
      if (!cached) {
        return errorResult(
          `No cached data for account "${accountId}". Run refresh_cache first.`
        );
      }
      return successResult({
        source: "cache",
        accountId: cached.accountId,
        accountName: cached.accountName,
        lastUpdated: cached.lastUpdated,
        totalSites: cached.sites.length,
        sites: cached.sites,
      });
    }

    // All accounts - flat unique list
    const allSites = getAllCachedSitesFlat();
    const cache = getCachedSites();
    if (!cache) {
      return errorResult(
        "Cache is empty. Run refresh_cache to fetch sites from all accounts."
      );
    }

    return successResult({
      source: "cache",
      lastFullRefresh: cache.lastFullRefresh,
      totalAccounts: cache.accounts.length,
      totalUniqueSites: allSites.length,
      sites: allSites,
      accountDetails: cache.accounts.map((a) => ({
        accountId: a.accountId,
        accountName: a.accountName,
        sitesCount: a.sites.length,
        lastUpdated: a.lastUpdated,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function getSite(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;

  try {
    const { result, usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        const response = await service.sites.get({ siteUrl });
        return response.data;
      }
    );

    return successResult({ ...result, _usedAccountId: usedAccountId });
  } catch (error) {
    return formatError(error);
  }
}

export async function addSite(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;

  try {
    const { usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      undefined,
      async (service) => {
        await service.sites.add({ siteUrl });
        return null;
      }
    );

    return successResult(
      `Site "${siteUrl}" has been added to GSC (via account: ${usedAccountId}). Run refresh_cache to update local cache.`
    );
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteSite(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;

  try {
    const { usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        await service.sites.delete({ siteUrl });
        return null;
      }
    );

    return successResult(
      `Site "${siteUrl}" has been removed from GSC (via account: ${usedAccountId}). Run refresh_cache to update local cache.`
    );
  } catch (error) {
    return formatError(error);
  }
}
