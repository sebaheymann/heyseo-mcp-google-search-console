import { inspectUrlRaw } from "./urlInspection.js";
import {
  formatError,
  errorResult,
  successResult,
  validateRequired,
} from "../utils/errors.js";
import type { ToolResult } from "../types.js";

export async function inspectUrlRichResults(
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

    const richResultsResult = data.richResultsResult as
      | Record<string, unknown>
      | undefined;

    if (!richResultsResult) {
      return successResult({
        inspectionUrl: args.inspectionUrl,
        _usedAccountId: usedAccountId,
        richResultsResult: {
          verdict: "VERDICT_UNSPECIFIED",
          detectedItems: [],
          message: "No rich results / structured data detected for this URL.",
        },
      });
    }

    return successResult({
      inspectionUrl: args.inspectionUrl,
      _usedAccountId: usedAccountId,
      richResultsResult,
    });
  } catch (error) {
    return formatError(error);
  }
}
