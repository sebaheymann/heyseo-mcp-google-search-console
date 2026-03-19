export type Verdict = "PASS" | "FAIL" | "NEUTRAL" | "VERDICT_UNSPECIFIED";

export type RobotsTxtState = "ALLOWED" | "DISALLOWED" | "ROBOTS_TXT_STATE_UNSPECIFIED";

export type IndexingState =
  | "INDEXING_ALLOWED"
  | "BLOCKED_BY_META_TAG"
  | "BLOCKED_BY_HTTP_HEADER"
  | "BLOCKED_BY_ROBOTS_TXT"
  | "INDEXING_STATE_UNSPECIFIED";

export type PageFetchState =
  | "SUCCESSFUL"
  | "SOFT_404"
  | "BLOCKED_ROBOTS_TXT"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "SERVER_ERROR"
  | "REDIRECT_ERROR"
  | "ACCESS_FORBIDDEN"
  | "BLOCKED_4XX"
  | "INTERNAL_CRAWL_ERROR"
  | "INVALID_URL"
  | "PAGE_FETCH_STATE_UNSPECIFIED";

export type CrawledAs = "MOBILE" | "DESKTOP" | "CRAWLING_USER_AGENT_UNSPECIFIED";

export type Severity = "WARNING" | "ERROR";

export interface IndexStatusResult {
  verdict: Verdict;
  coverageState?: string;
  robotsTxtState?: RobotsTxtState;
  indexingState?: IndexingState;
  lastCrawlTime?: string;
  pageFetchState?: PageFetchState;
  googleCanonical?: string;
  userCanonical?: string;
  crawledAs?: CrawledAs;
  sitemap?: string[];
  referringUrls?: string[];
}

export interface MobileUsabilityIssue {
  issueType?: string;
  severity?: Severity;
  message?: string;
}

export interface MobileUsabilityResult {
  verdict: Verdict;
  issues?: MobileUsabilityIssue[];
}

export interface RichResultIssue {
  issueMessage?: string;
  severity?: Severity;
}

export interface RichResultItem {
  name?: string;
  issues?: RichResultIssue[];
}

export interface DetectedItem {
  richResultType?: string;
  items?: RichResultItem[];
}

export interface RichResultsResult {
  verdict: Verdict;
  detectedItems?: DetectedItem[];
}

export interface AmpIssue {
  issueType?: string;
  severity?: Severity;
  issueMessage?: string;
}

export interface AmpResult {
  verdict: Verdict;
  ampUrl?: string;
  ampIndexStatusVerdict?: Verdict;
  robotsTxtState?: RobotsTxtState;
  indexingState?: IndexingState;
  lastCrawlTime?: string;
  pageFetchState?: PageFetchState;
  issues?: AmpIssue[];
}

export interface InspectionResult {
  inspectionResultLink?: string;
  indexStatusResult?: IndexStatusResult;
  mobileUsabilityResult?: MobileUsabilityResult;
  richResultsResult?: RichResultsResult;
  ampResult?: AmpResult;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsFilter {
  dimension: string;
  operator: string;
  expression: string;
}

export interface SearchAnalyticsFilterGroup {
  groupType?: string;
  filters: SearchAnalyticsFilter[];
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
