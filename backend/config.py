import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

# Base project paths
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
DATASET_PATH = BASE_DIR/ "Dataset.xlsx"
OUTPUT_PATH = BACKEND_DIR / "processed_dataset.xlsx"
CHROMA_DB_DIR = str(BACKEND_DIR / "chroma_db")

# Classification framework definition (aligned with frontend)
DRIVERS = {
    "Brand Perception": [
        "Thought Leadership",
        "Product Strategy",
        "Brand Visibility & Marketing"
    ],
    "User Experience": [
        "Product & Service Quality",
        "Customer Support & Complaint Resolution",
        "Digital & Omnichannel Experience"
    ],
    "Responsible Business Practices": [
        "Regulatory Compliance & Ethical Governance",
        "Social Impact & Community (CSR)"
    ]
}

ALL_DRIVERS = list(DRIVERS.keys())
ALL_SUB_DRIVERS = [sub for subs in DRIVERS.values() for sub in subs]

def get_openai_client(api_key: str = None) -> OpenAI:
    key = api_key or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ValueError("OpenAI API Key is required but not provided or found in environment.")
    return OpenAI(api_key=key)

def is_openai_configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))