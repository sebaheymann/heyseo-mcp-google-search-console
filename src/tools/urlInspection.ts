import { executeWithFailover } from "../failover.js";
import {
  formatError,
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import type { ToolResult } from "../types.js";

const VALID_SECTIONS = ["indexStatus", "mobile", "amp"] as const;
type Section = (typeof VALID_SECTIONS)[number];

const SECTION_KEYS: Record<Section, string> = {
  indexStatus: "indexStatusResult",
  mobile: "mobileUsabilityResult",
  amp: "ampResult",
};

async function inspectUrlRaw(
  siteUrl: string,
  inspectionUrl: string,
  languageCode?: string,
  accountId?: string
): Promise<{ data: Record<string, unknown>; usedAccountId: string }> {
  const { result, usedAccountId } = await executeWithFailover(
    accountId,
    siteUrl,
    async (service) => {
      const response = await service.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl,
          siteUrl,
          languageCode: languageCode || "en",
        },
      });
      return (response.data.inspectionResult || {}) as Record<string, unknown>;
    }
  );
  return { data: result, usedAccountId };
}

function filterSections(
  data: Record<string, unknown>,
  sections?: string[]
): Record<string, unknown> {
  // Always strip richResultsResult (that's a separate tool)
  const { richResultsResult, ...rest } = data;

  if (!sections || sections.length === 0) {
    return rest;
  }

  const filtered: Record<string, unknown> = {};

  // Always include inspectionResultLink if present
  if (rest.inspectionResultLink) {
    filtered.inspectionResultLink = rest.inspectionResultLink;
  }

  for (const section of sections) {
    const key = SECTION_KEYS[section as Section];
    if (key && rest[key] !== undefined) {
      filtered[key] = rest[key];
    }
  }

  return filtered;
}

// ─── Main inspect_url (with optional sections filter) ───────────────────────

export async function inspectUrl(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "inspectionUrl"]);
  if (validation) return errorResult(validation);

  const sections = args.sections as string[] | undefined;
  if (sections) {
    const invalid = sections.filter(
      (s) => !VALID_SECTIONS.includes(s as Section)
    );
    if (invalid.length > 0) {
      return errorResult(
        `Invalid sections: ${invalid.join(", ")}. Valid: ${VALID_SECTIONS.join(", ")}`
      );
    }
  }

  try {
    const { data, usedAccountId } = await inspectUrlRaw(
      args.siteUrl as string,
      args.inspectionUrl as string,
      args.languageCode as string | undefined,
      args.accountId as string | undefined
    );

    const filtered = filterSections(data, sections);

    return successResult({
      inspectionUrl: args.inspectionUrl,
      _usedAccountId: usedAccountId,
      _sections: sections || ["indexStatus", "mobile", "amp"],
      ...filtered,
    });
  } catch (error) {
    return formatError(error);
  }
}

// ─── Per-section tools ──────────────────────────────────────────────────────

export async function inspectUrlIndexStatus(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "inspectionUrl"]);
  if (validation) return errorResult(validation);

  try {
    const { data, usedAccountId } = await inspectUrlRaw(
      args.siteUrl as string,
      args.inspectionUrl as string,
      args.languageCode as string | undefined,
      args.accountId as string | undefined
    );

    return successResult({
      inspectionUrl: args.inspectionUrl,
      _usedAccountId: usedAccountId,
      indexStatusResult: data.indexStatusResult || null,
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function inspectUrlMobile(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "inspectionUrl"]);
  if (validation) return errorResult(validation);

  try {
    const { data, usedAccountId } = await inspectUrlRaw(
      args.siteUrl as string,
      args.inspectionUrl as string,
      args.languageCode as string | undefined,
      args.accountId as string | undefined
    );

    return successResult({
      inspectionUrl: args.inspectionUrl,
      _usedAccountId: usedAccountId,
      mobileUsabilityResult: data.mobileUsabilityResult || null,
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function inspectUrlAmp(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "inspectionUrl"]);
  if (validation) return errorResult(validation);

  try {
    const { data, usedAccountId } = await inspectUrlRaw(
      args.siteUrl as string,
      args.inspectionUrl as string,
      args.languageCode as string | undefined,
      args.accountId as string | undefined
    );

    return successResult({
      inspectionUrl: args.inspectionUrl,
      _usedAccountId: usedAccountId,
      ampResult: data.ampResult || null,
    });
  } catch (error) {
    return formatError(error);
  }
}

// ─── Batch inspect ──────────────────────────────────────────────────────────

export async function batchInspectUrls(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateRequired(args, ["siteUrl", "urls"]);
  if (validation) return errorResult(validation);

  const urls = args.urls as string[];
  if (!Array.isArray(urls) || urls.length === 0) {
    return errorResult("Parameter 'urls' must be a non-empty array.");
  }
  if (urls.length > 50) {
    return errorResult("Maximum 50 URLs per batch.");
  }

  const siteUrl = args.siteUrl as string;
  const languageCode = args.languageCode as string | undefined;
  const accountId = args.accountId as string | undefined;
  const sections = args.sections as string[] | undefined;
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ url: string; error: string }> = [];
  const accountsUsed = new Set<string>();

  for (const url of urls) {
    try {
      const { data, usedAccountId } = await inspectUrlRaw(
        siteUrl,
        url,
        languageCode,
        accountId
      );
      accountsUsed.add(usedAccountId);
      const filtered = filterSections(data, sections);

      results.push({
        inspectionUrl: url,
        _usedAccountId: usedAccountId,
        ...filtered,
      });
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return successResult({
    siteUrl,
    totalRequested: urls.length,
    totalSuccess: results.length,
    totalErrors: errors.length,
    accountsUsed: Array.from(accountsUsed),
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export { inspectUrlRaw };
