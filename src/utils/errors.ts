import type { ToolResult } from "../types.js";

export function formatError(error: unknown): ToolResult {
  if (error instanceof Error) {
    const gaxiosError = error as any;

    if (gaxiosError.response?.status) {
      const status = gaxiosError.response.status;
      const message =
        gaxiosError.response?.data?.error?.message || gaxiosError.message;

      switch (status) {
        case 401:
          return errorResult(
            `Authentication error (401): ${message}. Token may be expired. Try restarting the MCP server to re-authenticate.`
          );
        case 403:
          return errorResult(
            `Permission denied (403): ${message}. Your Google account may not have access to this GSC property.`
          );
        case 404:
          return errorResult(
            `Not found (404): ${message}. Check the siteUrl format - domain properties use "sc-domain:example.com", URL-prefix properties use "https://example.com/".`
          );
        case 429:
          return errorResult(
            `Rate limit exceeded (429): ${message}. Wait a moment and try again.`
          );
        case 500:
        case 503:
          return errorResult(
            `Google API server error (${status}): ${message}. Try again later.`
          );
        default:
          return errorResult(`API error (${status}): ${message}`);
      }
    }

    return errorResult(error.message);
  }

  return errorResult(String(error));
}

export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function successResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function validateRequired(
  args: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const field of fields) {
    if (args[field] === undefined || args[field] === null || args[field] === "") {
      return `Missing required parameter: ${field}`;
    }
  }
  return null;
}
