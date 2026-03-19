import { getSearchConsoleService } from "../auth.js";
import { isRateLimitError, markRateLimited, findAlternativeAccount, isAccountRateLimited } from "../failover.js";
import { resolveAccount } from "../accounts.js";
import {
  formatError,
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import type { ToolResult, SearchAnalyticsRow, SearchAnalyticsFilterGroup } from "../types.js";

const API_MAX_ROWS = 25000;
const ABSOLUTE_MAX_ROWS = 10_000_000;

export async function querySearchAnalytics(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "startDate", "endDate"]);
  if (validation) return errorResult(validation);

  const siteUrl = args.siteUrl as string;
  const startDate = args.startDate as string;
  const endDate = args.endDate as string;
  const dimensions = (args.dimensions as string[]) || ["query"];
  const searchType = (args.searchType as string) || "web";
  const dimensionFilterGroups =
    (args.dimensionFilterGroups as SearchAnalyticsFilterGroup[]) || undefined;
  const aggregationType = (args.aggregationType as string) || undefined;
  const dataState = (args.dataState as string) || undefined;
  const userRowLimit = args.rowLimit as number | undefined;
  const requestedAccountId = args.accountId as string | undefined;

  const effectiveMax = Math.min(
    userRowLimit || ABSOLUTE_MAX_ROWS,
    ABSOLUTE_MAX_ROWS
  );

  // Resolve starting account
  let currentAccountId: string;
  try {
    const account = resolveAccount(requestedAccountId);
    currentAccountId = account.id;
  } catch (error) {
    return formatError(error);
  }

  try {
    const allRows: SearchAnalyticsRow[] = [];
    let startRow = 0;
    let pagesRetrieved = 0;
    let accountSwitches = 0;
    const accountsUsed = new Set<string>();
    accountsUsed.add(currentAccountId);

    while (allRows.length < effectiveMax) {
      const chunkLimit = Math.min(API_MAX_ROWS, effectiveMax - allRows.length);

      const requestBody: Record<string, unknown> = {
        startDate,
        endDate,
        dimensions,
        type: searchType,
        rowLimit: chunkLimit,
        startRow,
      };

      if (dimensionFilterGroups) {
        requestBody.dimensionFilterGroups = dimensionFilterGroups;
      }
      if (aggregationType) {
        requestBody.aggregationType = aggregationType;
      }
      if (dataState) {
        requestBody.dataState = dataState;
      }

      let success = false;
      let retriesForThisChunk = 0;
      const maxRetries = 10; // max account switches per chunk

      while (!success && retriesForThisChunk < maxRetries) {
        try {
          // Skip rate-limited accounts
          if (isAccountRateLimited(currentAccountId)) {
            const alt = findAlternativeAccount(siteUrl, currentAccountId);
            if (alt) {
              console.error(
                `[HeySEO GSC] Account "${currentAccountId}" is rate-limited. Switching to "${alt}".`
              );
              currentAccountId = alt;
              accountsUsed.add(alt);
              accountSwitches++;
              continue;
            }
          }

          const service = await getSearchConsoleService(currentAccountId);
          const response = await service.searchanalytics.query({
            siteUrl,
            requestBody,
          });

          const rows = (response.data.rows || []) as SearchAnalyticsRow[];
          pagesRetrieved++;

          if (rows.length === 0) {
            success = true;
            // No more data - break outer loop too
            startRow = effectiveMax; // force outer loop exit
            break;
          }

          allRows.push(...rows);
          startRow += rows.length;
          success = true;

          if (pagesRetrieved % 10 === 0) {
            console.error(
              `[HeySEO GSC] Search Analytics: ${allRows.length} rows (page ${pagesRetrieved}, account: ${currentAccountId})...`
            );
          }

          if (rows.length < chunkLimit) {
            startRow = effectiveMax; // force outer loop exit - last page
          }
        } catch (error) {
          if (isRateLimitError(error)) {
            markRateLimited(currentAccountId);
            retriesForThisChunk++;

            const alt = findAlternativeAccount(siteUrl, currentAccountId);
            if (alt) {
              console.error(
                `[HeySEO GSC] Rate limit on "${currentAccountId}". Switching to "${alt}" (rows so far: ${allRows.length}).`
              );
              currentAccountId = alt;
              accountsUsed.add(alt);
              accountSwitches++;
            } else {
              // No alternative accounts available
              return successResult({
                siteUrl,
                startDate,
                endDate,
                dimensions,
                searchType,
                totalRows: allRows.length,
                pagesRetrieved,
                accountsUsed: Array.from(accountsUsed),
                accountSwitches,
                incomplete: true,
                incompleteReason:
                  "All accounts rate-limited. Partial data returned. Wait and run again with startRow offset.",
                lastStartRow: startRow,
                rows: allRows,
              });
            }
          } else {
            throw error;
          }
        }
      }

      if (!success) {
        return successResult({
          siteUrl,
          startDate,
          endDate,
          dimensions,
          searchType,
          totalRows: allRows.length,
          pagesRetrieved,
          accountsUsed: Array.from(accountsUsed),
          accountSwitches,
          incomplete: true,
          incompleteReason: "Max retries exhausted for a chunk. Partial data returned.",
          lastStartRow: startRow,
          rows: allRows,
        });
      }
    }

    return successResult({
      siteUrl,
      startDate,
      endDate,
      dimensions,
      searchType,
      totalRows: allRows.length,
      pagesRetrieved,
      accountsUsed: Array.from(accountsUsed),
      accountSwitches,
      incomplete: false,
      rows: allRows,
    });
  } catch (error) {
    return formatError(error);
  }
}
