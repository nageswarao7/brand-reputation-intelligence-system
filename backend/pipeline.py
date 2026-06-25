import os
import sys
import json
import datetime
import pandas as pd
import logging
from typing import Optional
from urllib.parse import urlparse

from backend.config import DATASET_PATH, OUTPUT_PATH, is_openai_configured
from backend.classifier import AgenticClassifier
from backend.embeddings import EmbeddingsManager

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("Pipeline")

PROGRESS_FILE = os.path.join(os.path.dirname(__file__), "progress.json")

def set_progress(status: str, progress: int, error: str = None):
    try:
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"status": status, "progress": progress, "error": error}, f)
    except Exception as e:
        logger.error(f"Failed to write progress: {e}")

def to_clean_str(val) -> str:
    if pd.isna(val) or val is None:
        return ""
    val_str = str(val).strip()
    if val_str.lower() == "nan":
        return ""
    return val_str

def clean_source_name(source_name, url: str) -> str:
    """Impute source name from URL if missing."""
    src = to_clean_str(source_name)
    if not src:
        if url:
            try:
                parsed = urlparse(url)
                domain = parsed.netloc or parsed.path
                if domain.startswith("www."):
                    domain = domain[4:]
                return domain.split(".")[0].capitalize()
            except Exception:
                return "Unknown"
        return "Unknown"
    return src

def clean_title(title, text: str) -> str:
    """Impute title from opening text if missing."""
    t = to_clean_str(title)
    if not t:
        if text:
            # Take the first 5 words as title
            words = text.split()
            return " ".join(words[:5]) + "..."
        return "Untitled Mention"
    return t

def clean_date(date_val) -> Optional[str]:
    """Clean and parse date value, handling Excel serial date numbers."""
    val_str = to_clean_str(date_val)
    if not val_str:
        return None
    try:
        # Check if it is an Excel serial date number
        if val_str.isdigit():
            serial_days = int(val_str)
            base_date = datetime.datetime(1900, 1, 1)
            # Excel treats 1900 as a leap year, so serial values > 60 are off by 2 days
            dt = base_date + datetime.timedelta(days=serial_days - 2)
            return dt.strftime("%Y-%m-%d")
        elif isinstance(date_val, (int, float)):
            serial_days = int(date_val)
            base_date = datetime.datetime(1900, 1, 1)
            dt = base_date + datetime.timedelta(days=serial_days - 2)
            return dt.strftime("%Y-%m-%d")
            
        # Standardize date format to YYYY-MM-DD
        dt = pd.to_datetime(date_val)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None

def clean_reach(reach_val) -> float:
    """Clean and standardize reach value."""
    if pd.isna(reach_val):
        return 0.0
    try:
        # Remove commas, plus signs, etc.
        cleaned = str(reach_val).replace(",", "").replace("+", "").strip()
        return float(cleaned)
    except Exception:
        return 0.0

def execute_pipeline(api_key: str = None):
    """Run the end-to-end ingestion, classification, and vector indexing pipeline."""
    set_progress("processing", 10)
    logger.info(f"Starting data pipeline from dataset: {DATASET_PATH}")
    
    if not os.path.exists(DATASET_PATH):
        err = f"Dataset path not found at {DATASET_PATH}!"
        logger.error(err)
        set_progress("failed", 0, err)
        sys.exit(1)
        
    try:
        # 1. Load dataset
        df = pd.read_excel(DATASET_PATH)
        logger.info(f"Loaded raw dataset with {len(df)} rows.")
        set_progress("processing", 20)
        
        # 2. Ingestion & Schema Normalization
        processed_rows = []
        seen_texts = set()
        seen_urls = set()
        
        for idx, row in df.iterrows():
            url = to_clean_str(row.get("URL"))
            opening_text = to_clean_str(row.get("Opening Text"))
            hit_sentence = to_clean_str(row.get("Hit Sentence"))
            title = to_clean_str(row.get("Title"))
            
            # Skip completely empty rows
            if not url and not opening_text and not hit_sentence and not title:
                continue
                
                
            # Deduplication: check both URL and text content
            url_lower = url.lower() if url else ""
            if url_lower and url_lower in seen_urls:
                continue
                
            text_content = f"{opening_text} {hit_sentence}".strip().lower()
            if text_content in seen_texts:
                continue
                
            if url_lower:
                seen_urls.add(url_lower)
            if text_content:
                seen_texts.add(text_content)
                
            source_name = clean_source_name(row.get("Source Name"), url)
            cleaned_title = clean_title(row.get("Title"), opening_text)
            date_str = clean_date(row.get("Date"))
            reach = clean_reach(row.get("Reach"))
            
            processed_rows.append({
                "OriginalIndex": idx,
                "Date": date_str,
                "URL": url,
                "Source Name": source_name,
                "Title": cleaned_title,
                "Opening Text": opening_text,
                "Hit Sentence": hit_sentence,
                "Reach": reach
            })
            
        logger.info(f"Completed normalization and exact deduplication: {len(processed_rows)} unique rows remaining.")
        set_progress("processing", 30)
        
        # 3. Agentic Classification
        classifier = AgenticClassifier(api_key)
        embeddings_manager = EmbeddingsManager(api_key)
        
        # Clear ChromaDB before re-indexing
        embeddings_manager.clear_collection()
        
        final_records = []
        total_rows = len(processed_rows)
        
        for i, item in enumerate(processed_rows):
            title = item["Title"]
            opening_text = item["Opening Text"]
            hit_sentence = item["Hit Sentence"]
            
            logger.info(f"Classifying record {i+1}/{total_rows}...")
            
            # Run 3-node agent
            class_res = classifier.classify_mention(title, opening_text, hit_sentence)
            
            item["Driver"] = class_res.get("Driver", "Brand Perception")
            item["Sub driver"] = class_res.get("Sub driver", "Product Strategy")
            item["Sentiment"] = class_res.get("Sentiment", "Neutral")
            item["Theme"] = class_res.get("Theme", "General Brand")
            item["Rationale"] = class_res.get("rationale", "")
            
            final_records.append(item)
            
            # Update progress dynamically between 30% and 90%
            current_progress = 30 + int((i / total_rows) * 60)
            set_progress("processing", current_progress)
            
        # Convert to DataFrame
        final_df = pd.DataFrame(final_records)
        
        # Filter out irrelevant rows for the database index
        relevant_df = final_df[final_df["Driver"] != "Irrelevant"].copy()
        logger.info(f"Pipeline classified {len(relevant_df)} relevant entries out of {len(final_df)}.")
        
        # 4. Vector Database Indexing
        ids = []
        texts = []
        metadatas = []
        
        for _, row in relevant_df.iterrows():
            doc_id = f"mention_{row['OriginalIndex']}"
            document_text = f"Title: {row['Title']}\nOpening Text: {row['Opening Text']}\nHit Sentence: {row['Hit Sentence']}"
            
            metadata = {
                "Date": str(row["Date"]) if row["Date"] else "",
                "URL": str(row["URL"]),
                "Source Name": str(row["Source Name"]),
                "Title": str(row["Title"]),
                "Reach": float(row["Reach"]),
                "Driver": str(row["Driver"]),
                "Sub_driver": str(row["Sub driver"]),
                "Sentiment": str(row["Sentiment"]),
                "Theme": str(row.get("Theme", "General Brand")),
                "Rationale": str(row["Rationale"])
            }
            
            ids.append(doc_id)
            texts.append(document_text)
            metadatas.append(metadata)
            
        if ids:
            embeddings_manager.add_mentions(ids, texts, metadatas)
            logger.info(f"Successfully indexed {len(ids)} relevant entries in ChromaDB.")
            
        set_progress("processing", 95)
        
        # Save the output file
        final_df.to_excel(OUTPUT_PATH, index=False)
        logger.info(f"Pipeline execution completed. Processed results saved to {OUTPUT_PATH}")
        set_progress("completed", 100)
        
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        set_progress("failed", 0, str(e))
        sys.exit(1)

if __name__ == "__main__":
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY environment variable is not set. Running pipeline with local heuristic fallback.")
    else:
        logger.info("OPENAI_API_KEY found. Running pipeline with OpenAI LLM + Embeddings.")
        
    try:
        execute_pipeline(api_key)
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        sys.exit(1)