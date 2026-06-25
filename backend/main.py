import os
import json
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import pandas as pd

from backend.config import DATASET_PATH, OUTPUT_PATH, DRIVERS, ALL_DRIVERS, ALL_SUB_DRIVERS, get_openai_client
from backend.pipeline import execute_pipeline, PROGRESS_FILE
from backend.embeddings import EmbeddingsManager
from backend.prompts import get_llm_search_filter_prompts, get_insights_synthesis_prompts
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Reputation Intelligence API")

# Configure CORS so Next.js frontend can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProcessRequest(BaseModel):
    api_key: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 10
    api_key: Optional[str] = None
    sentiment: Optional[str] = None
    driver: Optional[str] = None

class FilterMatch(BaseModel):
    id: int = Field(description="The index/id of the matching mention.")
    relevance_score: float = Field(description="Semantic relevance score from 0.0 to 1.0. If no search query is specified but filters match, set to 1.0.")
    reason: str = Field(description="A brief explanation of how this matches the criteria.")

class SearchFilterResponse(BaseModel):
    matches: List[FilterMatch] = Field(...)

def clean_val(val) -> str:
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s

def get_progress_data() -> Dict[str, Any]:
    if not os.path.exists(PROGRESS_FILE):
        return {"status": "idle", "progress": 0, "error": None}
    try:
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"status": "idle", "progress": 0, "error": None}

def set_progress_data(status: str, progress: int, error: str = None):
    try:
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"status": status, "progress": progress, "error": error}, f)
    except Exception:
        pass

def run_pipeline_task(api_key: Optional[str]):
    try:
        execute_pipeline(api_key)
    except Exception as e:
        set_progress_data("failed", 0, str(e))

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "dataset_exists": os.path.exists(DATASET_PATH),
        "processed_exists": os.path.exists(OUTPUT_PATH)
    }

@app.get("/api/process/status")
def process_status():
    return get_progress_data()

@app.post("/api/process")
def trigger_processing(req: ProcessRequest, background_tasks: BackgroundTasks):
    progress = get_progress_data()
    if progress["status"] == "processing":
        return {"message": "Pipeline is already running.", "status": "processing"}
        
    set_progress_data("processing", 0)
    background_tasks.add_task(run_pipeline_task, req.api_key)
    return {"message": "Pipeline triggered successfully.", "status": "processing"}

@app.get("/api/overview")
def get_overview():
    if not os.path.exists(OUTPUT_PATH):
        raise HTTPException(status_code=400, detail="Processed dataset does not exist. Please trigger the pipeline first.")
        
    try:
        df = pd.read_excel(OUTPUT_PATH)
        # Exclude irrelevant mentions
        df_relevant = df[df["Driver"] != "Irrelevant"].copy()
        
        # 1. Base counts
        total_mentions = len(df_relevant)
        total_reach = float(df_relevant["Reach"].sum())
        avg_reach = float(df_relevant["Reach"].mean()) if total_mentions > 0 else 0.0
        
        # 2. Sentiment distribution
        sent_counts = df_relevant["Sentiment"].value_counts().to_dict()
        sentiment_distribution = {
            "Positive": int(sent_counts.get("Positive", 0)),
            "Neutral": int(sent_counts.get("Neutral", 0)),
            "Negative": int(sent_counts.get("Negative", 0))
        }
        
        # 3. Driver distribution
        driver_counts = df_relevant["Driver"].value_counts().to_dict()
        driver_distribution = {
            "Brand Perception": int(driver_counts.get("Brand Perception", 0)),
            "User Experience": int(driver_counts.get("User Experience", 0)),
            "Responsible Business Practices": int(driver_counts.get("Responsible Business Practices", 0))
        }
        
        # 4. Sub-parameter distribution
        sub_counts = df_relevant["Sub driver"].value_counts().to_dict()
        sub_parameter_distribution = {}
        for d, subs in DRIVERS.items():
            for sub in subs:
                sub_parameter_distribution[sub] = int(sub_counts.get(sub, 0))
                
        # 5. Extract themes dynamically based on the AI-generated Theme column or sub-drivers
        top_themes = []
        if "Theme" in df_relevant.columns:
            themes_counts = df_relevant["Theme"].value_counts().to_dict()
            for theme, count in themes_counts.items():
                if theme and not pd.isna(theme):
                    top_themes.append({"theme": str(theme), "count": int(count)})
        else:
            # If no Theme column yet, group by Sub driver to remain 100% dynamic
            for sub, count in sub_parameter_distribution.items():
                if count > 0:
                    top_themes.append({"theme": sub, "count": count})
                    
        top_themes.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "total_mentions": total_mentions,
            "total_reach": total_reach,
            "avg_reach": avg_reach,
            "sentiment_distribution": sentiment_distribution,
            "driver_distribution": driver_distribution,
            "sub_parameter_distribution": sub_parameter_distribution,
            "top_themes": top_themes[:5]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read processed metrics: {e}")

def llm_search_and_filter(
    df: pd.DataFrame,
    query: Optional[str] = None,
    sentiment: Optional[str] = None,
    driver: Optional[str] = None,
    sub_driver: Optional[str] = None,
    api_key: Optional[str] = None
) -> pd.DataFrame:
    """Uses centralized search filter service to match mentions based on criteria, purely AI-driven."""
    df_relevant = df[df["Driver"] != "Irrelevant"].copy()
    if df_relevant.empty:
        return df_relevant

    mentions_to_send = []
    for idx, row in df_relevant.iterrows():
        mentions_to_send.append({
            "id": int(idx),
            "title": str(row.get("Title", "")),
            "text": str(row.get("Opening Text", "")) + " " + str(row.get("Hit Sentence", "")),
            "sentiment": str(row.get("Sentiment", "Neutral")),
            "driver": str(row.get("Driver", "")),
            "sub_driver": str(row.get("Sub driver", ""))
        })

    try:
        from backend.llm import call_search_filtering
        parsed = call_search_filtering(
            query=query,
            sentiment=sentiment,
            driver=driver,
            sub_driver=sub_driver,
            mentions_json=json.dumps(mentions_to_send),
            api_key=api_key
        )
        matched_ids = [m.id for m in parsed.matches]
        scores = {m.id: m.relevance_score for m in parsed.matches}
        reasons = {m.id: m.reason for m in parsed.matches}
        
        df_matched = df_relevant[df_relevant.index.isin(matched_ids)].copy()
        if not df_matched.empty:
            df_matched["_llm_score"] = df_matched.index.map(scores)
            df_matched["_llm_reason"] = df_matched.index.map(reasons)
            df_matched = df_matched.sort_values(by="_llm_score", ascending=False)
            
        return df_matched
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Search & Filter failed: {e}")

@app.get("/api/mentions")
def get_mentions(
    sentiment: Optional[str] = None,
    driver: Optional[str] = None,
    sub_driver: Optional[str] = None,
    page: int = 1,
    limit: int = 15,
    api_key: Optional[str] = None
):
    if not os.path.exists(OUTPUT_PATH):
        raise HTTPException(status_code=400, detail="Processed dataset does not exist.")
        
    try:
        df = pd.read_excel(OUTPUT_PATH)
        
        # If any filters are active, run them through the AI/LLM search & filter
        if sentiment or driver or sub_driver:
            df_filtered = llm_search_and_filter(
                df=df,
                query=None,
                sentiment=sentiment,
                driver=driver,
                sub_driver=sub_driver,
                api_key=api_key
            )
        else:
            df_filtered = df[df["Driver"] != "Irrelevant"].copy()
            
        total = len(df_filtered)
        start = (page - 1) * limit
        end = page * limit
        
        records = []
        df_page = df_filtered.iloc[start:end]
        
        for _, row in df_page.iterrows():
            records.append({
                "Date": clean_val(row.get("Date")),
                "URL": clean_val(row.get("URL")),
                "Source Name": clean_val(row.get("Source Name")),
                "Title": clean_val(row.get("Title")),
                "Opening Text": clean_val(row.get("Opening Text")),
                "Hit Sentence": clean_val(row.get("Hit Sentence")),
                "Driver": clean_val(row.get("Driver")),
                "Sub driver": clean_val(row.get("Sub driver")),
                "Sentiment": clean_val(row.get("Sentiment", "Neutral")),
                "Reach": float(row.get("Reach", 0.0)) if not pd.isna(row.get("Reach")) else 0.0,
                "theme": clean_val(row.get("Theme")) if "Theme" in row else clean_val(row.get("Sub driver"))
            })
            
        return {
            "total": total,
            "page": page,
            "limit": limit,
            "records": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch mentions: {e}")

@app.post("/api/search")
def search_mentions_api(req: SearchRequest):
    if not os.path.exists(OUTPUT_PATH):
        raise HTTPException(status_code=400, detail="Processed dataset does not exist.")
        
    try:
        df = pd.read_excel(OUTPUT_PATH)
        
        df_candidates = df.copy()
        
        # If search query is provided, perform semantic retrieval from ChromaDB first
        if req.query and req.query.strip():
            try:
                from backend.embeddings import EmbeddingsManager
                em = EmbeddingsManager(req.api_key)
                search_results = em.semantic_search(req.query, limit=20)
                
                candidate_indices = []
                for r in search_results:
                    try:
                        # doc_id is f"mention_{row['OriginalIndex']}"
                        orig_idx = int(r["id"].replace("mention_", ""))
                        candidate_indices.append(orig_idx)
                    except Exception:
                        pass
                
                # Filter to only the candidates returned by ChromaDB
                df_candidates = df[df["OriginalIndex"].isin(candidate_indices)].copy()
            except Exception as e:
                logger.error(f"ChromaDB retrieval failed: {e}. Falling back to full dataset.")
                df_candidates = df.copy()
                
        df_filtered = llm_search_and_filter(
            df=df_candidates,
            query=req.query,
            sentiment=req.sentiment,
            driver=req.driver,
            sub_driver=None,
            api_key=req.api_key
        )
        
        filtered_results = []
        for _, row in df_filtered.iterrows():
            filtered_results.append({
                "id": f"mention_{row.get('OriginalIndex')}",
                "text": f"Title: {row.get('Title')}\nOpening Text: {row.get('Opening Text')}\nHit Sentence: {row.get('Hit Sentence')}",
                "score": float(row.get("_llm_score", 1.0)),
                "metadata": {
                    "url": str(row.get("URL", "")),
                    "source": str(row.get("Source Name", "")),
                    "date": str(row.get("Date", "")),
                    "sentiment": str(row.get("Sentiment", "Neutral")),
                    "driver": str(row.get("Driver", "")),
                    "sub_driver": str(row.get("Sub driver", "")),
                    "reach": float(row.get("Reach", 0.0)),
                    "theme": str(row.get("_llm_reason", "Matched search concept"))
                }
            })
            
        return {
            "query": req.query,
            "results": filtered_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Semantic search failed: {e}")

@app.get("/api/insights")
def get_insights(api_key: Optional[str] = None):
    if not os.path.exists(OUTPUT_PATH):
        raise HTTPException(status_code=400, detail="Processed dataset does not exist.")
        
    try:
        df = pd.read_excel(OUTPUT_PATH)
        df_relevant = df[df["Driver"] != "Irrelevant"].copy()
        
        driver_insights = []
        for d in ALL_DRIVERS:
            df_d = df_relevant[df_relevant["Driver"] == d]
            total_d = len(df_d)
            if total_d > 0:
                pos_pct = round((len(df_d[df_d["Sentiment"] == "Positive"]) / total_d) * 100, 1)
                neg_pct = round((len(df_d[df_d["Sentiment"] == "Negative"]) / total_d) * 100, 1)
            else:
                pos_pct = 0.0
                neg_pct = 0.0
                
            driver_insights.append({
                "driver": d,
                "total_mentions": total_d,
                "positive_percentage": float(pos_pct),
                "negative_percentage": float(neg_pct)
            })
            
        # Top high-risk mentions: negative sentiment with high reach
        df_neg = df_relevant[df_relevant["Sentiment"] == "Negative"].copy()
        df_neg_sorted = df_neg.sort_values(by="Reach", ascending=False)
        
        high_risk_mentions = []
        for _, row in df_neg_sorted.head(5).iterrows():
            high_risk_mentions.append({
                "Date": clean_val(row.get("Date")),
                "URL": clean_val(row.get("URL")),
                "Source Name": clean_val(row.get("Source Name")),
                "Title": clean_val(row.get("Title")),
                "Opening Text": clean_val(row.get("Opening Text")),
                "Hit Sentence": clean_val(row.get("Hit Sentence")),
                "Driver": clean_val(row.get("Driver")),
                "Sub driver": clean_val(row.get("Sub driver")),
                "Sentiment": clean_val(row.get("Sentiment", "Negative")),
                "Reach": float(row.get("Reach", 0.0)) if not pd.isna(row.get("Reach")) else 0.0
            })
            
        summary = ""
        if len(df_relevant) > 0:
            try:
                from backend.llm import call_insights_synthesis
                # Gather samples of positive and negative mentions
                df_pos_samples = df_relevant[df_relevant["Sentiment"] == "Positive"].head(5)
                pos_list = [{"Title": str(r.get("Title", "")), "Text": f"{r.get('Opening Text', '')} {r.get('Hit Sentence', '')}"} for _, r in df_pos_samples.iterrows()]
                
                df_neg_samples = df_relevant[df_relevant["Sentiment"] == "Negative"].head(5)
                neg_list = [{"Title": str(r.get("Title", "")), "Text": f"{r.get('Opening Text', '')} {r.get('Hit Sentence', '')}"} for _, r in df_neg_samples.iterrows()]
                
                driver_counts = df_relevant["Driver"].value_counts().to_dict()
                sentiment_counts = df_relevant["Sentiment"].value_counts().to_dict()
                
                summary = call_insights_synthesis(
                    total_mentions=len(df_relevant),
                    driver_counts=driver_counts,
                    sentiment_counts=sentiment_counts,
                    positive_samples=pos_list,
                    negative_samples=neg_list,
                    api_key=api_key
                )
            except Exception as e:
                # Dynamic synthesis fallback if API key is invalid/missing
                pos_total = len(df_relevant[df_relevant["Sentiment"] == "Positive"])
                neg_total = len(df_relevant[df_relevant["Sentiment"] == "Negative"])
                total_rel = len(df_relevant)
                nss = round(((pos_total - neg_total) / total_rel) * 100) if total_rel > 0 else 0
                
                if nss > 20:
                    summary = "Overall brand sentiment is strong and positive, primarily driven by solid investment performance and scheme returns. Please save your OpenAI API Key to enable dynamic, AI-generated reputation summaries."
                elif nss < -10:
                    summary = "Overall brand sentiment is net negative. Urgent intervention is required to resolve digital app bugs. Please save your OpenAI API Key to enable dynamic, AI-generated reputation summaries."
                else:
                    summary = "Brand sentiment remains balanced/neutral. Please save your OpenAI API Key to enable dynamic, AI-generated reputation summaries."
        else:
            summary = "No insights available (empty dataset)."
            
        return {
            "positive_drivers": [d for d in driver_insights if d["positive_percentage"] > 0],
            "negative_drivers": sorted([d for d in driver_insights if d["negative_percentage"] > 0], key=lambda x: x["negative_percentage"], reverse=True),
            "high_risk_mentions": high_risk_mentions,
            "overall_sentiment_summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate insights: {e}")