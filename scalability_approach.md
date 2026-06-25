# Brand Reputation Intelligence: Data Collection & Scalability Approach
**Client**: ICICI Prudential AMC  
**Consulting Advisor**: Eminence Strategy Consulting  
**Scope**: Part 3 (Automated Data Collection, Storage, Quality Control, and Scalability Architecture)

---

## 1. Overview
To monitor ICICI Prudential AMC's brand reputation effectively, this document outlines the architecture required to automate the daily collection of digital mentions from **news websites**, **Reddit**, and **X/Twitter**. The system is designed to run asynchronously, scale to thousands of daily mentions, handle data quality issues, and ensure sub-second semantic search response times.

---

## 2. Data Collection Approach
We utilize a multi-source ingestion pipeline that leverages specialized crawlers, web scrapers, and official APIs to extract text mentions daily:

1. **News Websites (Mainstream & Financial Media)**:
   * **RSS Feed Polling**: Poll feeds of major outlets (e.g., Economic Times, Moneycontrol, BloombergQuint) every 30 minutes using a Python-based feed parser.
   * **Sitemap & Archive Scraping**: Crawl sitemaps for newly published articles containing targeted keywords (e.g., *"ICICI Prudential Mutual Fund"*, *"Naren CIO"*, *"Pru Mutual Fund"*).
   * **Web Scraping (Full-Text Extraction)**: Once a new article URL is discovered via RSS/Sitemaps, fetch the HTML body and parse the clean text using **Newspaper3k** or **BeautifulSoup**, stripping out ads, sidebars, navigation bars, and headers.
   * **Aggregation Services**: Integrate with news search APIs (like NewsAPI or Google News feeds) to capture syndications on regional and local news outlets.

2. **Reddit**:
   * **Official API (PRAW)**: Run daily scheduled scripts via PRAW (Python Reddit API Wrapper) targeting Indian finance subreddits (e.g., `r/IndiaInvestments`, `r/personalfinanceindia`).
   * **Keyword Monitoring**: Stream posts and comments containing relevant terms and index conversations matching thread-level structures.
   * **Headless Scraping Fallback**: Deploy headless browsers using **Playwright** to scrape public subreddit pages directly when API rate limits are hit or OAuth restrictions apply.

3. **X/Twitter**:
   * **X API v2 Filtered Stream**: Set up a persistent connection to receive posts containing official handles (e.g. `@ICICIPruMF`), key brand tags, or hashtags in real-time.
   * **Recent Search API**: Run a daily batch job to search for contextual mentions (e.g. users complaining about app login errors or redemptions) that do not explicitly tag the brand.
   * **Custom Search Scrapers**: Implement authenticated browser sessions via **Puppeteer** or specialized proxy web scrapers to crawl keyword search results directly to bypass the cost constraints of the official X Enterprise API.

---

## 3. Storage Approach
To handle both transactional metrics and semantic search indexes, we implement a dual-storage system:

* **Transactional Database (PostgreSQL)**:
   * Stores structured relational metadata (Mentions Table: ID, Date, Source, Author, URL, Sentiment, Driver, Sub-driver, Reach).
   * Ensures indexing on query-heavy columns (`Source`, `Date`, `Sentiment`, `Driver`) for fast dashboard aggregation.
* **Vector Index (pgvector or ChromaDB)**:
   * Stores the 1536-dimensional embeddings generated using OpenAI's `text-embedding-3-small`.
   * Enables fast cosine similarity calculations during natural language queries.
* **Cold Storage Archive (AWS S3 / Google Cloud Storage)**:
   * Daily raw JSON payloads from all scrapers are archived to S3. This provides a backup database audit trail and enables future training of custom reputation models.

---

## 4. Handling Duplicates & Data Quality Issues
Ingesting digital mentions introduces high rates of noise, syndications, and spam. We apply two layers of filtration:

### 4.1 Duplicate Ingestion Controls
* **Exact Deduplication**: Enforce a unique constraint in PostgreSQL on the SHA-256 hash of the `URL` + `Raw Text`.
* **Near-Duplicate Detection (Locality Sensitive Hashing)**: Major press releases are syndicated across dozens of news domains. We run **MinHash LSH** during preprocessing. Mentions with a Jaccard similarity score greater than 85% are linked to the primary mention and aggregated rather than processed as separate records.

### 4.2 Data Quality & Spam Filtration
* **Lightweight Noise Removal**: Use regex rules to strip out HTML junk, URL shorteners, tracking tokens, and irrelevant social media platform elements.
* **Spam Filtering**: Implement heuristic thresholds (e.g., rejecting posts from accounts on X with less than 5 followers, or posts that contain more than 10 stock ticker symbols like `$NIFTY`, `$ICICI`) to eliminate automated stock-bot noise.
* **Language Isolation**: Apply a fast, lightweight language detector (`fasttext` or `langdetect`) to filter out non-English and non-Hindi content before it reaches the LLM pipeline.

---

## 5. Scalability Considerations
As the volume of ingested mentions increases (e.g., during major market corrections or product launches), the system maintains stability using the following patterns:

* **Task Queue Distribution (Celery + Redis)**:
   * Ingestion processes are run asynchronously. Scrapers dump raw payloads into a Redis message queue, and Celery workers process them in parallel.
   * Rates of API requests to X and Reddit are throttled automatically to respect vendor limits.
* **Bulk Vector Updates**:
   * Instead of individual vector upserts, new embeddings are batched (in groups of 100) and written to ChromaDB/pgvector to maintain search performance.
* **Horizontal Auto-scaling**:
   * Workers are containerized using Docker and deployed on Kubernetes (or AWS ECS), allowing the system to scale worker counts based on CPU usage or queue size.

---

## 6. Key Limitations & Trade-offs
1. **Paywalls & Anti-Scraping Mechanisms**:
   * **Challenge**: Major news platforms (e.g., ET Prime) block scraping.
   * **Trade-off**: The system will index only the public preview snippets/headlines instead of fetching the complete article text.
2. **High Social API Costs**:
   * **Challenge**: The official X API has high pricing tiers for access.
   * **Trade-off**: The pipeline prioritizes targeted RSS, news feeds, and Reddit APIs, keeping X queries highly restricted to specific brand keywords to stay within budget constraints.
3. **LLM Execution Latency & Cost**:
   * **Challenge**: Processing thousands of daily mentions through a 3-node agentic loop (Relevance -> Classify -> Audit) is computationally expensive.
   * **Trade-off**: We implement a **Semantic Cache** (e.g., GPTCache). If a new mention is semantically identical to a previously processed one (e.g., an identical syndicated press release), it skips the LLM nodes and inherits the cached classification.
