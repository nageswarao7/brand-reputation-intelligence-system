# Brand Reputation Intelligence System

An AI-powered reputation analytics platform designed for **ICICI Prudential AMC**. The system automatically ingests messy digital mentions, cleans and pre-processes them, classifies them through a **3-node agentic self-correcting OpenAI pipeline**, indexes them semantically in **ChromaDB**, and visualizes the results inside a high-fidelity **Next.js Dashboard**.

Developed by **Eminence Strategy Consulting** for the AI & Data Solutions Specialist assessment.

---

## 🛠️ Technology Stack
* **Frontend**: Next.js 15 (React + TypeScript + TailwindCSS v4 + Lucide Icons)
* **Backend**: FastAPI (Python) + Pandas (Data Cleaning) + Openpyxl
* **AI Orchestration**: Pure Python Agentic Loop (Relevance Filter → Framework Classifier → Critic & Verifier)
* **LLM & Embeddings**: OpenAI API (`gpt-4.1` & `text-embedding-3-small`)
* **Vector Store**: ChromaDB (Cosine similarity search)

---

## 📁 Project Directory Structure
```
Datasolutions/
│
├── Dataset.xlsx                # Original raw digital mentions spreadsheet
├── assessment.md               # Original client guidelines
├── methodology.md              # Methodology & Scalability architecture report
├── README.md                   # Setup and usage guide (this file)
│
├── backend/                    # Python FastAPI API & Data processing
│   ├── chroma_db/              # Persistent Chroma Vector DB store
│   ├── config.py               # Shared variables, categories and OpenAI clients
│   ├── classifier.py           # 3-Node Agentic Classifier + Local Heuristic fallback
│   ├── embeddings.py           # OpenAI Embeddings & ChromaDB integration
│   ├── pipeline.py             # Preprocessing & indexing runner
│   ├── main.py                 # FastAPI server & route handlers
│   └── processed_dataset.xlsx  # Resulting cleaned, categorized spreadsheet
│
└── frontend/                   # Next.js 15 React application
    ├── src/
    │   ├── app/                # Page layouts, styles, and dashboard components
    │   └── lib/                # API client helper (api.ts)
    ├── package.json
    └── tsconfig.json
```

---

## 🚀 Setup & Execution Guide (Instant Run)

Since the pre-processed dataset (`processed_dataset.xlsx`) and the persistent vector database (`chroma_db/`) are already packaged in this repository, you can launch the application **immediately out-of-the-box** without running any pipeline script or configuring API keys.

### 📋 Prerequisites
* **Python 3.10+** (Ensure it is added to your system PATH)
* **Node.js 18.0+** (with npm package manager)

---

### 1. Install Dependencies

* **Setup the Backend:**
  From the root directory, activate a virtual environment and install the Python libraries:
  ```bash
  # Create & activate virtual environment
  python -m venv venv
  
  # On Windows:
  venv\Scripts\activate
  # On macOS/Linux:
  source venv/bin/activate

  # Install required packages
  pip install -r backend/requirements.txt
  ```

* **Setup the Frontend:**
  From the root directory, navigate to the `frontend` folder and install Node packages:
  ```bash
  cd frontend
  npm install
  cd ..
  ```

---

### 2. Start the Application

To run the application, start both the FastAPI backend and Next.js frontend in separate terminal windows (from the root directory):

* **Terminal 1: Start Backend**
  ```bash
  # Ensure your virtual environment is active
  # On Windows:
  venv\Scripts\activate
  # On macOS/Linux:
  source venv/bin/activate

  # Option A: Start backend directly from the root folder
  uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

  # Option B: Alternatively, navigate into the backend folder and start it
  cd backend
  uvicorn main:app --host 127.0.0.1 --port 8000 --reload
  ```

* **Terminal 2: Start Frontend**
  ```bash
  cd frontend
  npm run dev
  ```

Once both services are running, open your web browser and navigate to **[http://localhost:3000](http://localhost:3000)**. The dashboard will load instantly.

---

## 🔑 Configure OpenAI API Key (Optional)

An OpenAI API Key is **only** required if you want to use advanced AI features:
1. **Semantic Search** (to generate embeddings for search queries).
2. **Dynamic Strategic Insights** (to generate custom LLM summaries).
3. **Regenerate / Re-run the Ingestion Pipeline** (to re-classify all mentions).

To configure the API key, you can either:
* **Option A:** Create a `.env` file in the `backend/` directory and add your key:
  ```env
  OPENAI_API_KEY=your_actual_openai_api_key_here
  ```
* **Option B:** Click the **"Add OpenAI Key"** (or **"OpenAI Configured"**) button in the top-right corner of the web dashboard to enter it dynamically (stored in your browser session).

---

## 🔄 Re-Running the Agentic Pipeline (Optional)

If you wish to re-classify the raw digital mentions in `Dataset.xlsx` from scratch and build a fresh vector index:
1. Ensure your virtual environment is active.
2. (Optional) Provide your OpenAI API key in `backend/.env`. If no key is provided, the pipeline automatically falls back to a local heuristic classifier.
3. Run the ingestion pipeline script:
   * **Option A: From the root directory**
     ```bash
     python -m backend.pipeline
     ```
   * **Option B: From the `backend` directory**
     ```bash
     cd backend
     python pipeline.py
     ```
4. This will clean the data, execute the 3-node agentic self-correcting classifier loop, write a new `processed_dataset.xlsx`, and re-index the mentions inside `backend/chroma_db/`.
