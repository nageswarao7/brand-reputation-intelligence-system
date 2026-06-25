import os
import logging
from typing import List, Dict, Any, Tuple, Optional
from pydantic import BaseModel, Field
from typing import Literal
from openai import OpenAI

from backend.config import get_openai_client, DRIVERS, ALL_DRIVERS, ALL_SUB_DRIVERS
from backend.prompts import (
    get_relevance_filter_prompts,
    get_classify_framework_prompts,
    get_critic_verifier_prompts,
    get_llm_search_filter_prompts,
    get_insights_synthesis_prompts
)

logger = logging.getLogger("LLMService")

# --- Schemas ---

class RelevanceResponse(BaseModel):
    is_relevant: bool = Field(description="True if the text is relevant to ICICI Prudential AMC or its mutual funds, False if it is spam, noise, or about other unrelated entities.")
    rationale: str = Field(description="Brief reason for the relevance decision.")

class ClassificationResponse(BaseModel):
    driver: Literal["Brand Perception", "User Experience", "Responsible Business Practices"] = Field(description="The main reputation driver.")
    sub_driver: Literal[
        "Thought Leadership", 
        "Product Strategy", 
        "Brand Visibility & Marketing",
        "Product & Service Quality",
        "Customer Support & Complaint Resolution",
        "Digital & Omnichannel Experience",
        "Regulatory Compliance & Ethical Governance",
        "Social Impact & Community (CSR)"
    ] = Field(description="The sub-parameter within the driver.")
    sentiment: Literal["Positive", "Neutral", "Negative"] = Field(description="The overall sentiment of the mention.")
    theme: str = Field(description="A short 2-4 word theme or topic of the mention, e.g. 'App Performance', 'SEBI Audit', 'NFO Launch'.")
    rationale: str = Field(description="Detailed reason for this classification.")

class CriticResponse(BaseModel):
    is_correct: bool = Field(description="True if the classification is logically correct and matches the text context, False if there is a contradiction or mistake.")
    feedback: str = Field(description="Feedback explaining why it is correct or what needs correction.")
    corrected_driver: Optional[Literal["Brand Perception", "User Experience", "Responsible Business Practices"]] = Field(None, description="The corrected main driver, if is_correct is False.")
    corrected_sub_driver: Optional[Literal[
        "Thought Leadership", 
        "Product Strategy", 
        "Brand Visibility & Marketing",
        "Product & Service Quality",
        "Customer Support & Complaint Resolution",
        "Digital & Omnichannel Experience",
        "Regulatory Compliance & Ethical Governance",
        "Social Impact & Community (CSR)"
    ]] = Field(None, description="The corrected sub-parameter, if is_correct is False.")
    corrected_sentiment: Optional[Literal["Positive", "Neutral", "Negative"]] = Field(None, description="The corrected sentiment, if is_correct is False.")
    corrected_theme: Optional[str] = Field(None, description="The corrected theme, if is_correct is False.")

class FilterMatch(BaseModel):
    id: int = Field(description="The index/id of the matching mention.")
    relevance_score: float = Field(description="Semantic relevance score from 0.0 to 1.0. If no search query is specified but filters match, set to 1.0.")
    reason: str = Field(description="A brief explanation of how this matches the criteria.")

class SearchFilterResponse(BaseModel):
    matches: List[FilterMatch] = Field(description="List of evaluated mentions.")

# --- LLM Client Interface ---

def call_relevance_filter(title: str, opening_text: str, hit_sentence: str, api_key: Optional[str] = None) -> RelevanceResponse:
    client = get_openai_client(api_key)
    context = f"Title: {title}\nOpening Text: {opening_text}\nHit Sentence: {hit_sentence}"
    system_prompt, user_prompt = get_relevance_filter_prompts(context)
    
    completion = client.beta.chat.completions.parse(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=RelevanceResponse
    )
    return completion.choices[0].message.parsed

def call_classify_framework(title: str, opening_text: str, hit_sentence: str, api_key: Optional[str] = None) -> ClassificationResponse:
    client = get_openai_client(api_key)
    context = f"Title: {title}\nOpening Text: {opening_text}\nHit Sentence: {hit_sentence}"
    system_prompt, user_prompt = get_classify_framework_prompts(context)
    
    completion = client.beta.chat.completions.parse(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=ClassificationResponse
    )
    return completion.choices[0].message.parsed

def call_critic_verifier(title: str, opening_text: str, hit_sentence: str, current_driver: str, current_sub_driver: str, current_sentiment: str, current_rationale: str, api_key: Optional[str] = None) -> CriticResponse:
    client = get_openai_client(api_key)
    context = f"Title: {title}\nOpening Text: {opening_text}\nHit Sentence: {hit_sentence}"
    current_class = (
        f"Driver: {current_driver}\n"
        f"Sub-driver: {current_sub_driver}\n"
        f"Sentiment: {current_sentiment}\n"
        f"Rationale: {current_rationale}"
    )
    system_prompt, user_prompt = get_critic_verifier_prompts(context, current_class)
    
    completion = client.beta.chat.completions.parse(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=CriticResponse
    )
    return completion.choices[0].message.parsed

def call_get_embedding(text: str, api_key: Optional[str] = None) -> List[float]:
    if not text:
        return [0.0] * 1536
    client = get_openai_client(api_key)
    response = client.embeddings.create(
        input=[text.replace("\n", " ")],
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

def call_search_filtering(query: str, sentiment: Optional[str], driver: Optional[str], sub_driver: Optional[str], mentions_json: str, api_key: Optional[str] = None) -> SearchFilterResponse:
    client = get_openai_client(api_key)
    system_prompt, user_prompt = get_llm_search_filter_prompts(
        query=query,
        sentiment=sentiment,
        driver=driver,
        sub_driver=sub_driver,
        mentions_json=mentions_json
    )
    completion = client.beta.chat.completions.parse(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=SearchFilterResponse
    )
    return completion.choices[0].message.parsed

def call_insights_synthesis(total_mentions: int, driver_counts: Dict[str, int], sentiment_counts: Dict[str, int], positive_samples: List[Dict[str, str]], negative_samples: List[Dict[str, str]], api_key: Optional[str] = None) -> str:
    import json
    client = get_openai_client(api_key)
    system_prompt, user_prompt = get_insights_synthesis_prompts(
        total_mentions=total_mentions,
        driver_counts=json.dumps(driver_counts),
        sentiment_counts=json.dumps(sentiment_counts),
        positive_samples_json=json.dumps(positive_samples),
        negative_samples_json=json.dumps(negative_samples)
    )
    completion = client.chat.completions.create(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3
    )
    return completion.choices[0].message.content or "No insights synthesized."
