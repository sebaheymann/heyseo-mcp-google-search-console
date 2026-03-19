import { executeWithFailover } from "../failover.js";
import {
  formatError,
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import type { ToolResult } from "../types.js";

export async function listSitemaps(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;

  try {
    const { result, usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        const response = await service.sitemaps.list({
          siteUrl,
          sitemapIndex: args.sitemapIndex as string | undefined,
        });
        const sitemaps = response.data.sitemap || [];
        return {
          totalSitemaps: sitemaps.length,
          sitemaps: sitemaps.map((sm) => ({
            path: sm.path,
            lastSubmitted: sm.lastSubmitted,
            lastDownloaded: sm.lastDownloaded,
            isPending: sm.isPending,
            isSitemapsIndex: sm.isSitemapsIndex,
            type: sm.type,
            warnings: sm.warnings,
            errors: sm.errors,
            contents: sm.contents?.map((c) => ({
              type: c.type,
              submitted: c.submitted,
              indexed: c.indexed,
            })),
          })),
        };
      }
    );

    return successResult({ ...result, _usedAccountId: usedAccountId });
  } catch (error) {
    return formatError(error);
  }
}

export async function getSitemap(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "feedpath"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;
  const feedpath = args.feedpath as string;

  try {
    const { result, usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        const response = await service.sitemaps.get({ siteUrl, feedpath });
        return response.data;
      }
    );

    return successResult({ ...result, _usedAccountId: usedAccountId });
  } catch (error) {
    return formatError(error);
  }
}

export async function submitSitemap(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "feedpath"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;
  const feedpath = args.feedpath as string;

  try {
    const { usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        await service.sitemaps.submit({ siteUrl, feedpath });
        return null;
      }
    );

    return successResult(
      `Sitemap "${feedpath}" submitted for "${siteUrl}" (via account: ${usedAccountId}).`
    );
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteSitemap(args: Record<string, unknown>): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "feedpath"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;
  const feedpath = args.feedpath as string;

  try {
    const { usedAccountId } = await executeWithFailover(
      args.accountId as string | undefined,
      siteUrl,
      async (service) => {
        await service.sitemaps.delete({ siteUrl, feedpath });
        return null;
      }
    );

    return successResult(
      `Sitemap "${feedpath}" deleted from "${siteUrl}" (via account: ${usedAccountId}).`
    );
  } catch (error) {
    return formatError(error);
  }
}
