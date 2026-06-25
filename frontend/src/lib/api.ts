const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export interface OverviewStats {
  total_mentions: number;
  total_reach: number;
  avg_reach: number;
  sentiment_distribution: {
    Positive: number;
    Neutral: number;
    Negative: number;
  };
  driver_distribution: {
    "Brand Perception": number;
    "User Experience": number;
    "Responsible Business Practices": number;
  };
  sub_parameter_distribution: Record<string, number>;
  top_themes: Array<{ theme: string; count: number }>;
}

export interface MentionRecord {
  Date: string;
  URL: string;
  "Source Name": string;
  Title: string;
  "Opening Text": string;
  "Hit Sentence": string;
  Driver: string;
  "Sub driver": string;
  Sentiment: "Positive" | "Neutral" | "Negative";
  Reach: number;
  theme?: string;
}

export interface MentionsResponse {
  total: number;
  page: number;
  limit: number;
  records: MentionRecord[];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: {
    url: string;
    source: string;
    date: string;
    sentiment: "Positive" | "Neutral" | "Negative";
    driver: string;
    sub_driver: string;
    reach: number;
    theme: string;
  };
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface DriverInsight {
  driver: string;
  total_mentions: number;
  positive_percentage: number;
  negative_percentage: number;
}

export interface InsightsResponse {
  positive_drivers: DriverInsight[];
  negative_drivers: DriverInsight[];
  high_risk_mentions: MentionRecord[];
  overall_sentiment_summary: string;
}

export interface PipelineStatus {
  status: "idle" | "processing" | "completed" | "failed";
  progress: number;
  error: string | null;
}

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const res = await fetch(`${BACKEND_URL}/api/overview`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch overview stats");
  }
  return res.json();
}

export async function fetchMentions(
  params: {
    sentiment?: string;
    driver?: string;
    sub_driver?: string;
    page?: number;
    limit?: number;
    apiKey?: string;
  } = {}
): Promise<MentionsResponse> {
  const query = new URLSearchParams();
  if (params.sentiment) query.append("sentiment", params.sentiment);
  if (params.driver) query.append("driver", params.driver);
  if (params.sub_driver) query.append("sub_driver", params.sub_driver);
  if (params.page) query.append("page", params.page.toString());
  if (params.limit) query.append("limit", params.limit.toString());

  const key = params.apiKey || (typeof window !== "undefined" ? localStorage.getItem("openai_api_key") : null);
  if (key) query.append("api_key", key);

  const res = await fetch(`${BACKEND_URL}/api/mentions?${query.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch mentions");
  }
  return res.json();
}

export async function searchMentions(
  queryText: string,
  topK: number = 10,
  apiKey?: string,
  sentiment?: string,
  driver?: string
): Promise<SearchResponse> {
  const res = await fetch(`${BACKEND_URL}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: queryText,
      top_k: topK,
      api_key: apiKey,
      sentiment,
      driver,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Semantic search failed");
  }
  return res.json();
}

export async function fetchInsights(apiKey?: string): Promise<InsightsResponse> {
  const query = new URLSearchParams();
  const key = apiKey || (typeof window !== "undefined" ? localStorage.getItem("openai_api_key") : null);
  if (key) query.append("api_key", key);

  const res = await fetch(`${BACKEND_URL}/api/insights?${query.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch insights");
  }
  return res.json();
}

export async function triggerProcessing(apiKey?: string): Promise<{ message: string; status: string }> {
  const res = await fetch(`${BACKEND_URL}/api/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to trigger processing");
  }
  return res.json();
}

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  const res = await fetch(`${BACKEND_URL}/api/process/status`);
  if (!res.ok) {
    throw new Error("Failed to fetch pipeline status");
  }
  return res.json();
}

export async function checkHealth(): Promise<{ status: string; dataset_exists: boolean; processed_exists: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/health`);
  if (!res.ok) {
    throw new Error("Backend is offline");
  }
  return res.json();
}
