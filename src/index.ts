#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { listSites, getSite, addSite, deleteSite } from "./tools/sites.js";
import {
  listSitemaps,
  getSitemap,
  submitSitemap,
  deleteSitemap,
} from "./tools/sitemaps.js";
import { querySearchAnalytics } from "./tools/searchAnalytics.js";
import {
  inspectUrl,
  inspectUrlIndexStatus,
  inspectUrlMobile,
  inspectUrlAmp,
  batchInspectUrls,
} from "./tools/urlInspection.js";
import { inspectUrlRichResults } from "./tools/richResults.js";
import { clearAccountCache, clearAllCaches } from "./auth.js";
import {
  loadConfig,
  addAccount,
  removeAccount,
  switchAccount,
  getActiveAccount,
  HEYSEO_DIR,
} from "./accounts.js";
import {
  refreshAllSites,
  refreshAccountSites,
  getCachedSites,
  loadSitesCache,
} from "./cache.js";
import { errorResult, successResult } from "./utils/errors.js";

const ACCOUNT_ID_PROP = {
  accountId: {
    type: "string" as const,
    description:
      "Optional account ID. If not provided, uses the active account. On rate limit (429), automatically switches to another account that has access.",
  },
};

const server = new Server(
  {
    name: "heyseo-mcp-google-search-console",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tool Definitions ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Account Management ────────────────────────────────────────────
    {
      name: "list_accounts",
      description:
        "List all configured Google accounts and OAuth projects. Shows which account is active. Config stored in ~/.heyseo-gsc/.",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "add_account",
      description:
        "Add a new Google Cloud project (OAuth Client ID) linked to a Google email. Multiple projects can share the same email. On rate limit, failover tries other projects on the same email first, then switches to other emails. Browser opens for OAuth consent on first API use.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              'Friendly name for this project (e.g. "Firma XYZ - Projekt 1"). Becomes the account ID.',
          },
          email: {
            type: "string",
            description:
              'Google account email that will authorize this project (e.g. "user@gmail.com"). Projects with the same email are grouped for failover priority.',
          },
          clientSecretPath: {
            type: "string",
            description:
              "Absolute path to OAuth Client ID JSON from Google Cloud Console.",
          },
        },
        required: ["name", "email", "clientSecretPath"],
      },
    },
    {
      name: "remove_account",
      description: "Remove a Google account. Deletes token and credentials.",
      inputSchema: {
        type: "object" as const,
        properties: {
          accountId: {
            type: "string",
            description: "Account ID to remove (from list_accounts).",
          },
        },
        required: ["accountId"],
      },
    },
    {
      name: "switch_account",
      description:
        "Switch the default active account. Tools without explicit accountId will use this.",
      inputSchema: {
        type: "object" as const,
        properties: {
          accountId: {
            type: "string",
            description: "Account ID to activate.",
          },
        },
        required: ["accountId"],
      },
    },
    {
      name: "reset_account_auth",
      description:
        "Reset OAuth token for an account. Forces re-login on next API call.",
      inputSchema: {
        type: "object" as const,
        properties: {
          accountId: {
            type: "string",
            description: "Account ID to reset. Defaults to active account.",
          },
        },
        required: [],
      },
    },

    // ── Cache Management ──────────────────────────────────────────────
    {
      name: "refresh_cache",
      description:
        "Fetch sites from Google Search Console API for all accounts (or a specific one) and save to local cache (~/.heyseo-gsc/cache/sites.json). Run this after adding accounts or when you need fresh data. All list_sites calls read from this cache.",
      inputSchema: {
        type: "object" as const,
        properties: {
          accountId: {
            type: "string",
            description:
              "Optional: refresh only this account. If omitted, refreshes ALL accounts.",
          },
        },
        required: [],
      },
    },
    {
      name: "cache_status",
      description:
        "Show the current state of the local cache: when it was last refreshed, how many accounts and sites are cached.",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
    },

    // ── Sites ──────────────────────────────────────────────────────────
    {
      name: "list_sites",
      description:
        "List all GSC sites from LOCAL CACHE (no API call). Shows which accounts have access to each site. Run refresh_cache first to populate.",
      inputSchema: {
        type: "object" as const,
        properties: { ...ACCOUNT_ID_PROP },
        required: [],
      },
    },
    {
      name: "get_site",
      description: "Get details of a specific GSC property (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: {
            type: "string",
            description:
              'Site URL as in GSC. Domain: "sc-domain:example.com", URL-prefix: "https://example.com/".',
          },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl"],
      },
    },
    {
      name: "add_site",
      description: "Add a site to GSC (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL to add." },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl"],
      },
    },
    {
      name: "delete_site",
      description: "Remove a site from GSC (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL to remove." },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl"],
      },
    },

    // ── Sitemaps ───────────────────────────────────────────────────────
    {
      name: "list_sitemaps",
      description: "List sitemaps for a site (API call with auto-failover on rate limit).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          sitemapIndex: {
            type: "string",
            description: "Optional: sitemap index URL to filter children.",
          },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl"],
      },
    },
    {
      name: "get_sitemap",
      description: "Get sitemap details (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          feedpath: { type: "string", description: "Full URL of the sitemap." },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "feedpath"],
      },
    },
    {
      name: "submit_sitemap",
      description: "Submit/resubmit a sitemap (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          feedpath: { type: "string", description: "Full URL of sitemap to submit." },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "feedpath"],
      },
    },
    {
      name: "delete_sitemap",
      description: "Delete a sitemap (API call with auto-failover).",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          feedpath: { type: "string", description: "Full URL of sitemap to delete." },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "feedpath"],
      },
    },

    // ── Search Analytics ──────────────────────────────────────────────
    {
      name: "query_search_analytics",
      description:
        "Query GSC search analytics with auto-pagination (up to 10M rows in 25k chunks). On rate limit, automatically switches to another account and continues from where it stopped.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          startDate: { type: "string", description: "Start date YYYY-MM-DD." },
          endDate: { type: "string", description: "End date YYYY-MM-DD." },
          dimensions: {
            type: "array",
            items: { type: "string" },
            description:
              'Dimensions: "query", "page", "country", "device", "date", "searchAppearance". Default: ["query"].',
          },
          searchType: {
            type: "string",
            enum: ["web", "image", "video", "news", "discover"],
            description: 'Default: "web".',
          },
          dimensionFilterGroups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                groupType: { type: "string", enum: ["and"] },
                filters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      dimension: { type: "string" },
                      operator: {
                        type: "string",
                        enum: ["contains", "equals", "notContains", "notEquals", "includingRegex", "excludingRegex"],
                      },
                      expression: { type: "string" },
                    },
                    required: ["dimension", "operator", "expression"],
                  },
                },
              },
              required: ["filters"],
            },
            description: "Optional filters.",
          },
          aggregationType: {
            type: "string",
            enum: ["auto", "byPage", "byProperty"],
          },
          dataState: { type: "string", enum: ["all", "final"] },
          rowLimit: {
            type: "number",
            description: "Max rows (up to 10,000,000). Auto-paginates.",
          },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "startDate", "endDate"],
      },
    },

    // ── URL Inspection (combined with sections filter) ─────────────────
    {
      name: "inspect_url",
      description:
        'Inspect URL in GSC. By default returns all sections (indexStatus, mobile, amp). Use "sections" to pick specific ones. WITHOUT rich results - use inspect_url_rich_results for that. Auto-failover on rate limit.',
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          inspectionUrl: { type: "string", description: "URL to inspect." },
          sections: {
            type: "array",
            items: {
              type: "string",
              enum: ["indexStatus", "mobile", "amp"],
            },
            description:
              'Which sections to return. Options: "indexStatus" (indexing, canonical, crawl), "mobile" (mobile usability), "amp" (AMP status). Default: all three.',
          },
          languageCode: { type: "string", description: 'BCP-47 code, e.g. "pl". Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "inspectionUrl"],
      },
    },
    {
      name: "batch_inspect_urls",
      description:
        "Batch inspect up to 50 URLs. Supports sections filter. Auto-failover between accounts.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          urls: {
            type: "array",
            items: { type: "string" },
            description: "URLs to inspect (max 50).",
          },
          sections: {
            type: "array",
            items: { type: "string", enum: ["indexStatus", "mobile", "amp"] },
            description: 'Sections to return. Default: all.',
          },
          languageCode: { type: "string", description: 'BCP-47 code. Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "urls"],
      },
    },

    // ── Per-section inspection tools ──────────────────────────────────
    {
      name: "inspect_url_index_status",
      description:
        "Get ONLY indexing status for a URL: verdict, coverageState, robotsTxtState, indexingState, lastCrawlTime, pageFetchState, googleCanonical, userCanonical, crawledAs, sitemaps, referringUrls. Auto-failover.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          inspectionUrl: { type: "string", description: "URL to inspect." },
          languageCode: { type: "string", description: 'BCP-47 code. Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "inspectionUrl"],
      },
    },
    {
      name: "inspect_url_mobile",
      description:
        "Get ONLY mobile usability for a URL: verdict, issues (issueType, severity, message). Auto-failover.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          inspectionUrl: { type: "string", description: "URL to inspect." },
          languageCode: { type: "string", description: 'BCP-47 code. Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "inspectionUrl"],
      },
    },
    {
      name: "inspect_url_amp",
      description:
        "Get ONLY AMP results for a URL: verdict, ampUrl, ampIndexStatusVerdict, robotsTxtState, indexingState, pageFetchState, issues. Auto-failover.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          inspectionUrl: { type: "string", description: "URL to inspect." },
          languageCode: { type: "string", description: 'BCP-47 code. Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "inspectionUrl"],
      },
    },
    {
      name: "inspect_url_rich_results",
      description:
        "Get ONLY structured data / rich results for a URL: verdict, detectedItems (richResultType, items with name + issues with severity/message). Auto-failover.",
      inputSchema: {
        type: "object" as const,
        properties: {
          siteUrl: { type: "string", description: "Site URL as in GSC." },
          inspectionUrl: { type: "string", description: "URL to inspect." },
          languageCode: { type: "string", description: 'BCP-47 code. Default: "en".' },
          ...ACCOUNT_ID_PROP,
        },
        required: ["siteUrl", "inspectionUrl"],
      },
    },
  ],
}));

// ─── Tool Dispatcher ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args || {}) as Record<string, unknown>;

  switch (name) {
    // ── Account Management ──
    case "list_accounts": {
      try {
        const config = loadConfig();

        // Group by email
        const byEmail: Record<string, typeof config.accounts> = {};
        for (const a of config.accounts) {
          const email = a.email || "unknown";
          if (!byEmail[email]) byEmail[email] = [];
          byEmail[email].push(a);
        }

        return successResult({
          configDir: HEYSEO_DIR,
          activeAccountId: config.activeAccountId,
          totalEmails: Object.keys(byEmail).length,
          totalProjects: config.accounts.length,
          byEmail: Object.entries(byEmail).map(([email, accounts]) => ({
            email,
            projectCount: accounts.length,
            projects: accounts.map((a) => ({
              id: a.id,
              name: a.name,
              isActive: a.id === config.activeAccountId,
            })),
          })),
          failoverOrder:
            "On rate limit: 1) other projects on same email → 2) projects on other emails with site access → 3) all remaining projects on other emails",
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    case "add_account": {
      const accountName = toolArgs.name as string;
      const accountEmail = toolArgs.email as string;
      const clientSecretPath = toolArgs.clientSecretPath as string;
      if (!accountName || !accountEmail || !clientSecretPath) {
        return errorResult("'name', 'email', and 'clientSecretPath' are all required.");
      }
      try {
        const account = addAccount(accountName, accountEmail, clientSecretPath);
        clearAllCaches();
        return successResult({
          message: `Project "${account.name}" (ID: ${account.id}) added for email ${account.email}.`,
          account: { id: account.id, name: account.name, email: account.email },
          nextStep:
            "Run refresh_cache to fetch sites. Browser will open for OAuth consent on first API call.",
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    case "remove_account": {
      const removeId = toolArgs.accountId as string;
      if (!removeId) return errorResult("'accountId' is required.");
      try {
        removeAccount(removeId);
        clearAccountCache(removeId);
        return successResult(`Account "${removeId}" removed.`);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    case "switch_account": {
      const switchId = toolArgs.accountId as string;
      if (!switchId) return errorResult("'accountId' is required.");
      try {
        const account = switchAccount(switchId);
        return successResult(
          `Active account: "${account.name}" (${account.id}).`
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    case "reset_account_auth": {
      try {
        const resetId = toolArgs.accountId as string | undefined;
        const config = loadConfig();
        const targetId = resetId || config.activeAccountId;
        if (!targetId) return errorResult("No account specified.");
        const account = config.accounts.find((a) => a.id === targetId);
        if (!account) return errorResult(`Account "${targetId}" not found.`);
        const fs = await import("node:fs");
        if (fs.existsSync(account.tokenPath)) fs.unlinkSync(account.tokenPath);
        clearAccountCache(targetId);
        return successResult(
          `Auth reset for "${account.name}". Next API call will open browser for OAuth.`
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // ── Cache Management ──
    case "refresh_cache": {
      try {
        const accountId = toolArgs.accountId as string | undefined;
        if (accountId) {
          const entry = await refreshAccountSites(accountId);
          return successResult({
            message: `Cache refreshed for account "${entry.accountName}".`,
            accountId: entry.accountId,
            sitesCount: entry.sites.length,
            lastUpdated: entry.lastUpdated,
            sites: entry.sites,
          });
        } else {
          const cache = await refreshAllSites();
          return successResult({
            message: `Cache refreshed for all ${cache.accounts.length} account(s).`,
            lastFullRefresh: cache.lastFullRefresh,
            accounts: cache.accounts.map((a) => ({
              accountId: a.accountId,
              accountName: a.accountName,
              sitesCount: a.sites.length,
              lastUpdated: a.lastUpdated,
            })),
            totalSites: cache.accounts.reduce(
              (sum, a) => sum + a.sites.length,
              0
            ),
          });
        }
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    case "cache_status": {
      try {
        const cache = loadSitesCache();
        return successResult({
          cacheDir: HEYSEO_DIR + "/cache",
          lastFullRefresh: cache.lastFullRefresh || "never",
          totalAccounts: cache.accounts.length,
          accounts: cache.accounts.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            sitesCount: a.sites.length,
            lastUpdated: a.lastUpdated,
          })),
          totalCachedSites: cache.accounts.reduce(
            (sum, a) => sum + a.sites.length,
            0
          ),
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // ── Sites ──
    case "list_sites":
      return await listSites(toolArgs);
    case "get_site":
      return await getSite(toolArgs);
    case "add_site":
      return await addSite(toolArgs);
    case "delete_site":
      return await deleteSite(toolArgs);

    // ── Sitemaps ──
    case "list_sitemaps":
      return await listSitemaps(toolArgs);
    case "get_sitemap":
      return await getSitemap(toolArgs);
    case "submit_sitemap":
      return await submitSitemap(toolArgs);
    case "delete_sitemap":
      return await deleteSitemap(toolArgs);

    // ── Search Analytics ──
    case "query_search_analytics":
      return await querySearchAnalytics(toolArgs);

    // ── URL Inspection ──
    case "inspect_url":
      return await inspectUrl(toolArgs);
    case "batch_inspect_urls":
      return await batchInspectUrls(toolArgs);
    case "inspect_url_index_status":
      return await inspectUrlIndexStatus(toolArgs);
    case "inspect_url_mobile":
      return await inspectUrlMobile(toolArgs);
    case "inspect_url_amp":
      return await inspectUrlAmp(toolArgs);

    // ── Rich Results ──
    case "inspect_url_rich_results":
      return await inspectUrlRichResults(toolArgs);

    default:
      return errorResult(`Unknown tool: ${name}`);
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[HeySEO MCP Google Search Console] Server started.");
  console.error(`[HeySEO GSC] Config: ${HEYSEO_DIR}`);

  const config = loadConfig();
  if (config.accounts.length === 0) {
    console.error("[HeySEO GSC] No accounts. Use add_account to add one.");
  } else {
    console.error(
      `[HeySEO GSC] ${config.accounts.length} account(s). Active: ${config.activeAccountId || "(none)"}`
    );
    const cache = getCachedSites();
    if (!cache) {
      console.error("[HeySEO GSC] Cache empty. Run refresh_cache to populate.");
    } else {
      console.error(
        `[HeySEO GSC] Cache: ${cache.accounts.reduce((s, a) => s + a.sites.length, 0)} sites. Last refresh: ${cache.lastFullRefresh}`
      );
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
