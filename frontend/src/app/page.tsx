"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  Filter,
  Globe,
  Calendar,
  Award,
  ShieldAlert,
  Eye,
  Activity,
  FileSpreadsheet,
  Layers,
  Settings,
  Key,
  RefreshCw,
  Play,
  CheckCircle,
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
  Database
} from "lucide-react";

import {
  fetchOverviewStats,
  fetchMentions,
  searchMentions,
  fetchInsights,
  triggerProcessing,
  fetchPipelineStatus,
  checkHealth,
  OverviewStats,
  MentionRecord,
  InsightsResponse,
  PipelineStatus
} from "@/lib/api";

export default function Dashboard() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"overview" | "explorer" | "insights">("overview");

  // API and Key State
  const [apiKey, setApiKey] = useState("");
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const [dbStatus, setDbStatus] = useState<{ dataset_exists: boolean; processed_exists: boolean }>({
    dataset_exists: false,
    processed_exists: false
  });

  // Pipeline State
  const [pipelineState, setPipelineState] = useState<PipelineStatus>({
    status: "idle",
    progress: 0,
    error: null
  });

  // Data State
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [mentions, setMentions] = useState<MentionRecord[]>([]);
  const [totalMentions, setTotalMentions] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Filter and Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSemantic, setIsSemantic] = useState(false);
  const [selectedSentiment, setSelectedSentiment] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedSubDriver, setSelectedSubDriver] = useState("");

  // UI states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Load API Key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("openai_api_key") || "";
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySaved(true);
    }
    verifyBackend();
  }, []);

  // Poll pipeline progress if running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pipelineState.status === "processing") {
      interval = setInterval(async () => {
        try {
          const status = await fetchPipelineStatus();
          setPipelineState(status);
          if (status.status === "completed" || status.status === "failed") {
            verifyBackend();
          }
        } catch (e) {
          console.error("Error polling status:", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [pipelineState.status]);

  // Load data when tab changes or filters update
  useEffect(() => {
    if (dbStatus.processed_exists && activeTab === "overview") {
      loadOverviewStats();
    } else if (dbStatus.processed_exists && activeTab === "insights") {
      loadInsights();
    }
  }, [activeTab, dbStatus.processed_exists]);

  // Load explorer mentions when filters, page, or search settings change
  useEffect(() => {
    if (dbStatus.processed_exists && activeTab === "explorer") {
      if (isSemantic && searchQuery.trim()) {
        executeSemanticSearch();
      } else {
        loadExplorerMentions();
      }
    }
  }, [page, selectedSentiment, selectedDriver, selectedSubDriver, activeTab, dbStatus.processed_exists]);

  const verifyBackend = async () => {
    try {
      const health = await checkHealth();
      setBackendOnline(true);
      setDbStatus({
        dataset_exists: health.dataset_exists,
        processed_exists: health.processed_exists
      });

      // If processed file exists, load initial data
      if (health.processed_exists) {
        const status = await fetchPipelineStatus();
        setPipelineState(status);
        loadOverviewStats();
      }
    } catch (e) {
      setBackendOnline(false);
      setErrorMsg("FastAPI Backend appears to be offline. Make sure the backend server is running on port 8000.");
    }
  };

  const loadOverviewStats = async () => {
    setLoading(true);
    try {
      const data = await fetchOverviewStats();
      setStats(data);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load dashboard statistics");
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    setLoading(true);
    try {
      const data = await fetchInsights();
      setInsights(data);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load strategic insights");
    } finally {
      setLoading(false);
    }
  };

  const loadExplorerMentions = async () => {
    setLoading(true);
    try {
      const data = await fetchMentions({
        sentiment: selectedSentiment || undefined,
        driver: selectedDriver || undefined,
        sub_driver: selectedSubDriver || undefined,
        page,
        limit
      });
      setMentions(data.records);
      setTotalMentions(data.total);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg("Failed to load mentions catalog");
    } finally {
      setLoading(false);
    }
  };

  const executeSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      loadExplorerMentions();
      return;
    }
    setLoading(true);
    try {
      const data = await searchMentions(
        searchQuery,
        50, // Top 50 results
        apiKey || undefined,
        selectedSentiment || undefined,
        selectedDriver || undefined
      );
      // Map ChromaDB search results back to standard MentionRecord
      const formatted = data.results.map((r) => ({
        Date: r.metadata.date,
        URL: r.metadata.url,
        "Source Name": r.metadata.source,
        Title: r.text.split("\n")[0].replace("Title: ", ""),
        "Opening Text": r.text.split("\n")[1]?.replace("Opening Text: ", "") || "",
        "Hit Sentence": r.text.split("\n")[2]?.replace("Hit Sentence: ", "") || "",
        Driver: r.metadata.driver,
        "Sub driver": r.metadata.sub_driver,
        Sentiment: r.metadata.sentiment,
        Reach: r.metadata.reach,
        theme: r.metadata.theme
      }));
      setMentions(formatted);
      setTotalMentions(formatted.length);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e.message || "Semantic Search failed. Ensure you provided an API key if index is missing.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartPipeline = async () => {
    setErrorMsg(null);
    try {
      setPipelineState({ status: "processing", progress: 10, error: null });
      await triggerProcessing(apiKey || undefined);
      setInfoMsg("Pipeline has been triggered! Processing 94 digital mentions...");
    } catch (e: any) {
      setPipelineState({ status: "failed", progress: 0, error: e.message });
      setErrorMsg(e.message || "Failed to trigger processing pipeline.");
    }
  };

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem("openai_api_key", apiKey.trim());
      setIsKeySaved(true);
      setShowConfigModal(false);
      setInfoMsg("OpenAI API Key saved locally.");
    } else {
      localStorage.removeItem("openai_api_key");
      setIsKeySaved(false);
      setInfoMsg("OpenAI API Key cleared.");
    }
  };

  // Helper to render driver color badges
  const getDriverColor = (driver: string) => {
    switch (driver) {
      case "Brand Perception":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
      case "User Experience":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "Responsible Business Practices":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border border-gray-500/20";
    }
  };

  // Helper to render sentiment color badges
  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case "Positive":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25";
      case "Neutral":
        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25";
      case "Negative":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/25";
      default:
        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/70 border-b border-slate-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-500 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/10">
              <Activity className="h-6 w-6 text-slate-900 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">EMINENCE</span>
                <span className="text-xs uppercase bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-semibold border border-indigo-500/35">Intelligence</span>
              </div>
              <p className="text-xs text-slate-400">ICICI Prudential AMC Brand Reputation Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {/* API Key Configure Button */}
            <button
              onClick={() => setShowConfigModal(true)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isKeySaved
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                  : "bg-indigo-600/15 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/25"
                }`}
            >
              <Key className="h-3.5 w-3.5" />
              {isKeySaved ? "OpenAI Configured" : "Add OpenAI Key"}
            </button>

            {/* Refresh Connection Status */}
            <button
              onClick={verifyBackend}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh connection"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">

        {/* Connection Offline Warning */}
        {!backendOnline && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Backend Connection Offline</h4>
              <p className="text-xs mt-1">Failed to connect to the FastAPI server at <code>http://localhost:8000</code>. Please make sure the backend server is running.</p>
            </div>
          </div>
        )}

        {/* Global info/success message */}
        {infoMsg && (
          <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex justify-between items-center gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4.5 w-4.5 text-indigo-400 shrink-0" />
              <p className="text-xs">{infoMsg}</p>
            </div>
            <button onClick={() => setInfoMsg(null)} className="text-xs text-indigo-400 hover:text-indigo-200">Dismiss</button>
          </div>
        )}

        {/* Error Msg */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex justify-between items-center gap-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-400 shrink-0" />
              <p className="text-xs">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-400 hover:text-rose-200">Dismiss</button>
          </div>
        )}

        {/* Setup Screen / Running Pipeline screen */}
        {backendOnline && !dbStatus.processed_exists ? (
          <div className="max-w-xl mx-auto my-12 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="text-center mb-8">
              <div className="mx-auto w-14 h-14 bg-gradient-to-tr from-indigo-500/10 to-cyan-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 mb-4">
                <Database className="h-7 w-7 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Initialize Reputation Intelligence</h2>
              <p className="text-slate-400 text-xs mt-2 px-4">
                To explore brand analysis, we need to preprocess, classify, and index the 94 brand mentions in <code>Dataset.xlsx</code>.
              </p>
            </div>

            {pipelineState.status === "processing" ? (
              <div className="space-y-4 py-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-indigo-400 font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                    Running 3-Node Agentic Classifier...
                  </span>
                  <span className="text-slate-400">{pipelineState.progress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pipelineState.progress}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  Executing Relevance Check, framework mapping (8 sub-parameters), sentiment analysis, and indexing in ChromaDB.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                  <label className="block text-xs font-semibold text-slate-300">OpenAI API Key (Optional Fallback)</label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="sk-proj-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                    <Key className="absolute right-3 top-2.5 h-4 w-4 text-slate-600" />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    If no API key is specified, the server will process the spreadsheet immediately using a robust local heuristic classifier.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleStartPipeline}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-slate-950 text-xs font-bold py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Start Processing Pipeline
                  </button>
                </div>
              </div>
            )}

            {pipelineState.status === "failed" && (
              <div className="mt-4 p-3 bg-rose-500/15 border border-rose-500/25 rounded-lg text-rose-400 text-[11px]">
                <p className="font-semibold">Pipeline Execution Failed:</p>
                <p className="mt-1">{pipelineState.error}</p>
              </div>
            )}
          </div>
        ) : (
          /* Normal Dashboard Layout */
          <>
            {/* Tabs Selector */}
            <div className="flex border-b border-slate-900 mb-8 gap-6 text-sm">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-4 font-semibold transition-all relative flex items-center gap-2 ${activeTab === "overview" ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Layers className="h-4.5 w-4.5" />
                Overview Dashboard
                {activeTab === "overview" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500"></span>}
              </button>
              <button
                onClick={() => setActiveTab("explorer")}
                className={`pb-4 font-semibold transition-all relative flex items-center gap-2 ${activeTab === "explorer" ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Search className="h-4.5 w-4.5" />
                Content Explorer
                {activeTab === "explorer" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500"></span>}
              </button>
              <button
                onClick={() => setActiveTab("insights")}
                className={`pb-4 font-semibold transition-all relative flex items-center gap-2 ${activeTab === "insights" ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Award className="h-4.5 w-4.5" />
                Strategic Insights
                {activeTab === "insights" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500"></span>}
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && stats && (
              <div className="space-y-8 animate-fadeIn">
                {/* Metric Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Card 1 */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl"></div>
                    <p className="text-xs text-slate-400 font-semibold">Total Digital Mentions</p>
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-3xl font-extrabold text-white">{stats.total_mentions}</span>
                      <span className="text-xs text-slate-500">records</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-emerald-400">
                      <CheckCircle className="h-3 w-3" />
                      Cleaned & Standardized
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl"></div>
                    <p className="text-xs text-slate-400 font-semibold">Total Audience Reach</p>
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-3xl font-extrabold text-white">
                        {stats.total_reach >= 1000000
                          ? `${(stats.total_reach / 1000000).toFixed(1)}M`
                          : stats.total_reach.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
                      <Eye className="h-3 w-3 text-slate-500" />
                      Estimated impressions
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
                    <p className="text-xs text-slate-400 font-semibold">Average Reach</p>
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-3xl font-extrabold text-white">
                        {stats.avg_reach >= 1000
                          ? `${(stats.avg_reach / 1000).toFixed(1)}K`
                          : stats.avg_reach.toFixed(0)}
                      </span>
                      <span className="text-xs text-slate-500">/ mention</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      Reach standardized
                    </div>
                  </div>

                  {/* Card 4 */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl"></div>
                    <p className="text-xs text-slate-400 font-semibold">Net Sentiment Score</p>
                    <div className="flex items-baseline gap-2 mt-3">
                      {/* Formula: Pos% - Neg% */}
                      {(() => {
                        const total = stats.total_mentions;
                        const pos = stats.sentiment_distribution.Positive || 0;
                        const neg = stats.sentiment_distribution.Negative || 0;
                        const nss = total > 0 ? Math.round(((pos - neg) / total) * 100) : 0;
                        return (
                          <>
                            <span className={`text-3xl font-extrabold ${nss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {nss >= 0 ? `+${nss}%` : `${nss}%`}
                            </span>
                            <span className="text-xs text-slate-500">NSS</span>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
                      <Sparkles className="h-3 w-3 text-amber-400 animate-pulse" />
                      Key brand index
                    </div>
                  </div>
                </div>

                {/* Sentiment distribution bar */}
                <div className="bg-slate-900/20 border border-slate-900/80 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      <Activity className="h-4 w-4 text-indigo-400" />
                      Sentiment Distribution
                    </h3>
                    <div className="flex gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Positive ({Math.round((stats.sentiment_distribution.Positive / stats.total_mentions) * 100)}%)
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                        Neutral ({Math.round((stats.sentiment_distribution.Neutral / stats.total_mentions) * 100)}%)
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        Negative ({Math.round((stats.sentiment_distribution.Negative / stats.total_mentions) * 100)}%)
                      </span>
                    </div>
                  </div>

                  {/* Colored compound bar */}
                  <div className="w-full bg-slate-800/50 h-5 rounded-full overflow-hidden border border-slate-850 flex shadow-inner">
                    <div
                      className="bg-emerald-500 hover:bg-emerald-400 transition-all duration-300"
                      style={{ width: `${(stats.sentiment_distribution.Positive / stats.total_mentions) * 100}%` }}
                      title={`Positive: ${stats.sentiment_distribution.Positive}`}
                    ></div>
                    <div
                      className="bg-zinc-500 hover:bg-zinc-400 transition-all duration-300"
                      style={{ width: `${(stats.sentiment_distribution.Neutral / stats.total_mentions) * 100}%` }}
                      title={`Neutral: ${stats.sentiment_distribution.Neutral}`}
                    ></div>
                    <div
                      className="bg-rose-500 hover:bg-rose-400 transition-all duration-300"
                      style={{ width: `${(stats.sentiment_distribution.Negative / stats.total_mentions) * 100}%` }}
                      title={`Negative: ${stats.sentiment_distribution.Negative}`}
                    ></div>
                  </div>
                </div>

                {/* Driver Breakdown Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Category 1: Brand Perception */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4 border-b border-slate-850 pb-3">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded bg-cyan-400"></span>
                          Brand Perception
                        </h4>
                        <span className="text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 px-2.5 py-0.5 rounded-full font-semibold">
                          {stats.driver_distribution["Brand Perception"] || 0} mentions
                        </span>
                      </div>

                      {/* Sub-parameters progress bars */}
                      <div className="space-y-4 mt-4">
                        {[
                          "Thought Leadership",
                          "Product Strategy",
                          "Brand Visibility & Marketing"
                        ].map((sub) => {
                          const count = stats.sub_parameter_distribution[sub] || 0;
                          const pct = stats.total_mentions > 0 ? (count / stats.total_mentions) * 100 : 0;
                          return (
                            <div key={sub} className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">{sub}</span>
                                <span className="text-slate-200 font-semibold">{count}</span>
                              </div>
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${pct * 3}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Category 2: User Experience */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4 border-b border-slate-850 pb-3">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded bg-indigo-500"></span>
                          User Experience
                        </h4>
                        <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                          {stats.driver_distribution["User Experience"] || 0} mentions
                        </span>
                      </div>

                      {/* Sub-parameters progress bars */}
                      <div className="space-y-4 mt-4">
                        {[
                          "Product & Service Quality",
                          "Customer Support & Complaint Resolution",
                          "Digital & Omnichannel Experience"
                        ].map((sub) => {
                          const count = stats.sub_parameter_distribution[sub] || 0;
                          const pct = stats.total_mentions > 0 ? (count / stats.total_mentions) * 100 : 0;
                          return (
                            <div key={sub} className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">{sub}</span>
                                <span className="text-slate-200 font-semibold">{count}</span>
                              </div>
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${pct * 3}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Category 3: Responsible Business Practices */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4 border-b border-slate-850 pb-3">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                          Responsible Business
                        </h4>
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                          {stats.driver_distribution["Responsible Business Practices"] || 0} mentions
                        </span>
                      </div>

                      {/* Sub-parameters progress bars */}
                      <div className="space-y-4 mt-4">
                        {[
                          "Regulatory Compliance & Ethical Governance",
                          "Social Impact & Community (CSR)"
                        ].map((sub) => {
                          const count = stats.sub_parameter_distribution[sub] || 0;
                          const pct = stats.total_mentions > 0 ? (count / stats.total_mentions) * 100 : 0;
                          return (
                            <div key={sub} className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">{sub}</span>
                                <span className="text-slate-200 font-semibold">{count}</span>
                              </div>
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct * 3}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discussion Themes Section */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4 tracking-tight flex items-center gap-2">
                    <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />
                    Key Discussion Themes (Auto-Generated)
                  </h3>
                  <div className="flex flex-wrap gap-2.5">
                    {stats.top_themes.map((t, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:border-indigo-500/40 transition-colors"
                      >
                        <span className="text-slate-200 font-semibold">{t.theme}</span>
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-bold">
                          {t.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CONTENT EXPLORER */}
            {activeTab === "explorer" && (
              <div className="space-y-6 animate-fadeIn">
                {/* Search & Filter Toolbar */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm space-y-4">
                  <div className="flex flex-col lg:flex-row gap-3">
                    {/* Search Field */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder={isSemantic ? "Describe a concept (e.g. 'complaints about mobile app interface crashing')" : "Filter by title keyword..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (isSemantic) executeSemanticSearch();
                            else loadExplorerMentions();
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                      />
                      <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-500" />
                    </div>

                    {/* Semantic Toggle */}
                    <div className="flex items-center gap-3 bg-slate-950 border border-slate-850 px-3.5 py-1.5 rounded-lg shrink-0">
                      <span className="text-[11px] text-slate-400 font-semibold">Semantic Search</span>
                      <button
                        onClick={() => {
                          setIsSemantic(!isSemantic);
                          // Clear search state on toggle
                          setSearchQuery("");
                          setPage(1);
                        }}
                        className={`w-10 h-5.5 rounded-full transition-all relative p-0.5 ${isSemantic ? "bg-indigo-600" : "bg-slate-800"
                          }`}
                      >
                        <span className={`w-4.5 h-4.5 rounded-full bg-white block transition-all shadow-md ${isSemantic ? "translate-x-4.5" : "translate-x-0"
                          }`}></span>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        if (isSemantic) executeSemanticSearch();
                        else loadExplorerMentions();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors"
                    >
                      Search
                    </button>
                  </div>

                  {/* Dropdown Filters Row */}
                  <div className="flex flex-wrap gap-3 items-center text-xs border-t border-slate-900 pt-4">
                    <span className="text-slate-500 font-semibold flex items-center gap-1.5 shrink-0">
                      <Filter className="h-3.5 w-3.5" />
                      Filters:
                    </span>

                    {/* Sentiment */}
                    <select
                      value={selectedSentiment}
                      onChange={(e) => {
                        setSelectedSentiment(e.target.value);
                        setPage(1);
                      }}
                      className="bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 focus:outline-none text-slate-300"
                    >
                      <option value="">All Sentiments</option>
                      <option value="Positive">Positive</option>
                      <option value="Neutral">Neutral</option>
                      <option value="Negative">Negative</option>
                    </select>

                    {/* Driver */}
                    <select
                      value={selectedDriver}
                      onChange={(e) => {
                        setSelectedDriver(e.target.value);
                        setSelectedSubDriver(""); // reset sub-driver
                        setPage(1);
                      }}
                      className="bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 focus:outline-none text-slate-300"
                    >
                      <option value="">All Drivers</option>
                      <option value="Brand Perception">Brand Perception</option>
                      <option value="User Experience">User Experience</option>
                      <option value="Responsible Business Practices">Responsible Business Practices</option>
                    </select>

                    {/* Sub-driver */}
                    {selectedDriver && (
                      <select
                        value={selectedSubDriver}
                        onChange={(e) => {
                          setSelectedSubDriver(e.target.value);
                          setPage(1);
                        }}
                        className="bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 focus:outline-none text-slate-300"
                      >
                        <option value="">All Sub-parameters</option>
                        {selectedDriver === "Brand Perception" && (
                          <>
                            <option value="Thought Leadership">Thought Leadership</option>
                            <option value="Product Strategy">Product Strategy</option>
                            <option value="Brand Visibility & Marketing">Brand Visibility & Marketing</option>
                          </>
                        )}
                        {selectedDriver === "User Experience" && (
                          <>
                            <option value="Product & Service Quality">Product & Service Quality</option>
                            <option value="Customer Support & Complaint Resolution">Customer Support & Complaint Resolution</option>
                            <option value="Digital & Omnichannel Experience">Digital & Omnichannel Experience</option>
                          </>
                        )}
                        {selectedDriver === "Responsible Business Practices" && (
                          <>
                            <option value="Regulatory Compliance & Ethical Governance">Regulatory Compliance & Ethical Governance</option>
                            <option value="Social Impact & Community (CSR)">Social Impact & Community (CSR)</option>
                          </>
                        )}
                      </select>
                    )}

                    {/* Reset Button */}
                    {(selectedSentiment || selectedDriver || selectedSubDriver || searchQuery) && (
                      <button
                        onClick={() => {
                          setSelectedSentiment("");
                          setSelectedDriver("");
                          setSelectedSubDriver("");
                          setSearchQuery("");
                          setIsSemantic(false);
                          setPage(1);
                        }}
                        className="text-slate-400 hover:text-slate-200 underline cursor-pointer ml-auto"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Total results summary badge */}
                <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                  <p>
                    Showing <span className="text-white font-semibold">{mentions.length}</span> of{" "}
                    <span className="text-white font-semibold">{totalMentions}</span> matching mentions
                  </p>
                  {isSemantic && (
                    <span className="text-indigo-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Semantic search returns cosine similarity ranked results
                    </span>
                  )}
                </div>

                {/* Mentions list cards */}
                {loading ? (
                  <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
                    <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
                    Analyzing index database...
                  </div>
                ) : mentions.length === 0 ? (
                  <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-12 text-center text-slate-400 text-xs">
                    No mentions found matching the current search parameters.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mentions.map((m, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm hover:border-slate-800 transition-all space-y-3 relative overflow-hidden"
                      >
                        {/* Top Metadata Row */}
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-850 flex items-center gap-1">
                            <Globe className="h-3 w-3 text-slate-500" />
                            {m["Source Name"]}
                          </span>
                          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-850 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-500" />
                            {m.Date}
                          </span>
                          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-850 flex items-center gap-1">
                            <Eye className="h-3 w-3 text-slate-500" />
                            Reach: {m.Reach >= 1000 ? `${(m.Reach / 1000).toFixed(1)}K` : m.Reach.toFixed(0)}
                          </span>

                          <div className="flex gap-1.5 ml-auto">
                            <span className={`px-2 py-0.5 rounded font-semibold text-[9px] uppercase ${getSentimentBadge(m.Sentiment)}`}>
                              {m.Sentiment}
                            </span>
                            <span className={`px-2 py-0.5 rounded font-semibold text-[9px] uppercase ${getDriverColor(m.Driver)}`}>
                              {m["Sub driver"]}
                            </span>
                          </div>
                        </div>

                        {/* Title & URL */}
                        <div>
                          <h3 className="font-bold text-white text-xs leading-snug hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                            {m.URL ? (
                              <a href={m.URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                                {m.Title}
                                <ExternalLink className="h-3 w-3 inline text-slate-500" />
                              </a>
                            ) : (
                              m.Title
                            )}
                          </h3>
                        </div>

                        {/* Theme statement */}
                        {m.theme && (
                          <div className="text-[11px] text-indigo-400 italic bg-indigo-500/5 px-2.5 py-1 rounded border border-indigo-500/10 w-fit">
                            Theme: {m.theme}
                          </div>
                        )}

                        {/* Opening Text */}
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {m["Opening Text"]}
                        </p>

                        {/* Highlighted Hit Sentence */}
                        {m["Hit Sentence"] &&
                          m["Hit Sentence"].toString().trim() !== "" &&
                          m["Hit Sentence"].toString().trim().toLowerCase() !== "nan" &&
                          m["Hit Sentence"].toString().trim() !== m["Opening Text"] && (
                            <div className="bg-slate-950/80 p-3 rounded-lg border-l-2 border-indigo-500 text-[11px] text-slate-300">
                              <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Key Context Highlight:</span>
                              "{m["Hit Sentence"]}"
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {!isSemantic && mentions.length > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-400 mt-6 pt-4 border-t border-slate-900">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-3.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <span>
                      Page <span className="text-white font-semibold">{page}</span> of{" "}
                      <span className="text-white font-semibold">{Math.ceil(totalMentions / limit)}</span>
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= Math.ceil(totalMentions / limit)}
                      className="px-3.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: STRATEGIC INSIGHTS */}
            {activeTab === "insights" && insights && (
              <div className="space-y-8 animate-fadeIn">

                {/* Summary Statement Banner */}
                <div className="bg-gradient-to-r from-indigo-500/10 via-cyan-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
                  <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                    <Sparkles className="h-4.5 w-4.5 text-indigo-400 animate-pulse" />
                    Overall Reputation Intelligence Synthesis
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed max-w-4xl">
                    {insights.overall_sentiment_summary}
                  </p>
                </div>

                {/* Positive & Negative Driver Rankings */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Positive Driver Rankings */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <TrendingUp className="h-4.5 w-4.5 text-emerald-400" />
                      Positive Brand Equity Drivers
                    </h3>
                    <div className="space-y-4">
                      {insights.positive_drivers.length === 0 ? (
                        <p className="text-xs text-slate-500">No positive reputation signals cataloged.</p>
                      ) : (
                        insights.positive_drivers.map((d, idx) => (
                          <div key={idx} className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-slate-200">{d.driver}</span>
                              <span className="text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px]">
                                {d.positive_percentage}% Positive
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${d.positive_percentage}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              Based on {d.total_mentions} classified digital mentions.
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Negative Driver Rankings */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <TrendingDown className="h-4.5 w-4.5 text-rose-400" />
                      Vulnerability & Complaint Risk Drivers
                    </h3>
                    <div className="space-y-4">
                      {insights.negative_drivers.length === 0 ? (
                        <p className="text-xs text-slate-500">No negative vulnerability signals cataloged.</p>
                      ) : (
                        insights.negative_drivers.map((d, idx) => (
                          <div key={idx} className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-slate-200">{d.driver}</span>
                              <span className="text-rose-400 font-bold bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded text-[10px]">
                                {d.negative_percentage}% Complaints
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-rose-500 h-full rounded-full" style={{ width: `${d.negative_percentage}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              Based on {d.total_mentions} classified digital mentions.
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* High Impact Vulnerabilities / Risks */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 backdrop-blur-sm">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <ShieldAlert className="h-4.5 w-4.5 text-rose-400" />
                    High Impact Risk Alerts (High Reach Negative Mentions)
                  </h3>

                  <div className="space-y-4">
                    {insights.high_risk_mentions.length === 0 ? (
                      <div className="p-4 text-center bg-slate-950 border border-slate-850 rounded-lg text-slate-400 text-xs">
                        No high risk alerts detected.
                      </div>
                    ) : (
                      insights.high_risk_mentions.map((alert, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 border-l-4 border-rose-500/70 p-4 rounded-r-lg space-y-2.5 relative overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                            <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-850">
                              Source: {alert["Source Name"]}
                            </span>
                            <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-850">
                              Date: {alert.Date}
                            </span>
                            <span className="bg-rose-950/40 border border-rose-900/30 text-rose-400 px-2.5 py-0.5 rounded font-bold flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              Estimated Reach: {alert.Reach >= 1000 ? `${(alert.Reach / 1000).toFixed(1)}K` : alert.Reach}
                            </span>

                            <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-semibold text-[9px] uppercase ml-auto">
                              {alert["Sub driver"]}
                            </span>
                          </div>

                          <h4 className="font-bold text-slate-200 text-xs">
                            {alert.URL ? (
                              <a href={alert.URL} target="_blank" rel="noopener noreferrer" className="hover:text-rose-400 flex items-center gap-1">
                                {alert.Title}
                                <ExternalLink className="h-3 w-3 text-slate-500" />
                              </a>
                            ) : (
                              alert.Title
                            )}
                          </h4>

                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            {alert["Opening Text"]}
                          </p>

                          {alert["Hit Sentence"] &&
                            alert["Hit Sentence"].toString().trim() !== "" &&
                            alert["Hit Sentence"].toString().trim().toLowerCase() !== "nan" &&
                            alert["Hit Sentence"] !== alert["Opening Text"] && (
                              <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-[10.5px] text-rose-300 italic">
                                "{alert["Hit Sentence"]}"
                              </div>
                            )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/30 py-6 px-6 text-center text-[10px] text-slate-600 mt-auto">
        <p>© 2026 Eminence Strategy Consulting. Brand Reputation Intelligence Platform.</p>
        <p className="mt-1.5">Developed for AI & Data Solutions Specialist assessment compliance.</p>
      </footer>

      {/* OpenAI API KEY MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Settings className="h-4 w-4 text-indigo-400" />
                Configure API Settings
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 py-2">
              <p className="text-xs text-slate-400">
                To perform real-time data classifications or execute vector search embeddings, please configure your OpenAI API Key.
              </p>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-300">OpenAI API Key</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                  />
                  <Key className="absolute right-3 top-2.5 h-4 w-4 text-slate-600" />
                </div>
                <p className="text-[9px] text-slate-500">
                  This key is stored locally in your browser's <code>localStorage</code> and sent securely to your local FastAPI backend.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-850 text-xs">
              <button
                onClick={() => {
                  setApiKey("");
                  localStorage.removeItem("openai_api_key");
                  setIsKeySaved(false);
                  setShowConfigModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-400 font-semibold transition-colors"
              >
                Clear Key
              </button>
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
