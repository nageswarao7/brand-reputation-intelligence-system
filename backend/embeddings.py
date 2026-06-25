import os
import logging
from typing import List, Dict, Any, Optional
import chromadb

from backend.config import CHROMA_DB_DIR
from backend.llm import call_get_embedding

logger = logging.getLogger("EmbeddingsManager")

class EmbeddingsManager:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
                
        # Initialize persistent ChromaDB client
        self.chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        self.collection = self.chroma_client.get_or_create_collection("mentions_collection")

    def get_embedding(self, text: str) -> List[float]:
        """Generate OpenAI embeddings."""
        try:
            return call_get_embedding(text, self.api_key)
        except Exception as e:
            logger.error(f"Error generating OpenAI embedding: {e}")
            raise e

    def add_mentions(self, ids: List[str], texts: List[str], metadatas: List[Dict[str, Any]]):
        """Add mentions to ChromaDB with their metadata and embeddings."""
        embeddings = [self.get_embedding(text) for text in texts]
        # Clean metadata values to ensure they are primitives (ChromaDB requirement)
        cleaned_metadatas = []
        for meta in metadatas:
            clean_meta = {}
            for k, v in meta.items():
                if v is None or (isinstance(v, float) and v != v):  # NaN check
                    clean_meta[k] = ""
                elif isinstance(v, (str, int, float, bool)):
                    clean_meta[k] = v
                else:
                    clean_meta[k] = str(v)
            cleaned_metadatas.append(clean_meta)
            
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=cleaned_metadatas
        )

    def semantic_search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Perform cosine/semantic search on the collection."""
        if not query:
            return []
            
        query_embedding = self.get_embedding(query)
        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=limit
            )
            
            formatted_results = []
            if results and results["ids"] and len(results["ids"][0]) > 0:
                for idx in range(len(results["ids"][0])):
                    formatted_results.append({
                        "id": results["ids"][0][idx],
                        "document": results["documents"][0][idx],
                        "metadata": results["metadatas"][0][idx],
                        "distance": results["distances"][0][idx] if "distances" in results and results["distances"] else 0.0
                    })
            return formatted_results
        except Exception as e:
            logger.error(f"Error in semantic_search: {e}")
            return []

    def clear_collection(self):
        """Clear all entries in the collection."""
        try:
            # Delete all documents in the collection
            all_ids = self.collection.get()["ids"]
            if all_ids:
                self.collection.delete(ids=all_ids)
        except Exception as e:
            logger.error(f"Error clearing collection: {e}")