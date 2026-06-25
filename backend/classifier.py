import logging
from typing import Dict, Any

from backend.config import DRIVERS
from backend.llm import (
    call_relevance_filter, 
    call_classify_framework, 
    call_critic_verifier,
    RelevanceResponse,
    ClassificationResponse,
    CriticResponse
)

logger = logging.getLogger("AgenticClassifier")

class AgenticClassifier:
    def __init__(self, api_key: str = None):
        self.api_key = api_key

    def classify_mention(self, title: str, opening_text: str, hit_sentence: str) -> Dict[str, Any]:
        """E2E Agentic Pipeline for a single mention. Combines Node 1, Node 2, and Node 3."""
        # Node 1: Relevance Filter
        try:
            rel = call_relevance_filter(title, opening_text, hit_sentence, self.api_key)
        except Exception as e:
            logger.error(f"Error in relevance_filter: {e}")
            rel = RelevanceResponse(is_relevant=True, rationale="Error fallback: Assumed relevant")
            
        if not rel.is_relevant:
            return {
                "Driver": "Irrelevant",
                "Sub driver": "Irrelevant",
                "Sentiment": "Neutral",
                "rationale": f"Filtered out as irrelevant by AI: {rel.rationale}"
            }
            
        # Node 2: Framework Classification
        try:
            res = call_classify_framework(title, opening_text, hit_sentence, self.api_key)
        except Exception as e:
            logger.error(f"Error in classify_framework: {e}")
            res = ClassificationResponse(
                driver="Brand Perception",
                sub_driver="Product Strategy",
                sentiment="Neutral",
                theme="General Brand",
                rationale="Error fallback classification"
            )
        
        # Node 3: Critic Audit & Self-Correction
        try:
            audit = call_critic_verifier(
                title=title, 
                opening_text=opening_text, 
                hit_sentence=hit_sentence, 
                current_driver=res.driver, 
                current_sub_driver=res.sub_driver, 
                current_sentiment=res.sentiment, 
                current_rationale=res.rationale, 
                api_key=self.api_key
            )
        except Exception as e:
            logger.error(f"Error in critic_verifier: {e}")
            audit = CriticResponse(is_correct=True, feedback="Error fallback: Assume correct")
        
        driver = res.driver
        sub_driver = res.sub_driver
        sentiment = res.sentiment
        theme = res.theme
        rationale = res.rationale
        
        if not audit.is_correct:
            logger.info(f"Self-Correction triggered. Feedback: {audit.feedback}")
            new_driver = audit.corrected_driver or driver
            new_sub_driver = audit.corrected_sub_driver or sub_driver
            new_sentiment = audit.corrected_sentiment or sentiment
            new_theme = audit.corrected_theme or theme
            
            # Enforce hierarchical consistency guardrail
            if new_sub_driver in DRIVERS.get(new_driver, []):
                driver = new_driver
                sub_driver = new_sub_driver
                sentiment = new_sentiment
                theme = new_theme
                rationale = f"Self-Corrected: {audit.feedback} | Original: {res.rationale}"
            else:
                # In case of inconsistency, find correct driver matching the corrected sub-driver
                found_driver = None
                for d_name, subs in DRIVERS.items():
                    if new_sub_driver in subs:
                        found_driver = d_name
                        break
                if found_driver:
                    driver = found_driver
                    sub_driver = new_sub_driver
                    sentiment = new_sentiment
                    theme = new_theme
                    rationale = f"Self-Corrected (Hierarchical Guardrail applied): {audit.feedback} | Original: {res.rationale}"
                else:
                    # If sub-driver is also invalid or irrelevant, ignore inconsistent change and only correct sentiment/theme if requested
                    if new_sentiment:
                        sentiment = new_sentiment
                    if new_theme:
                        theme = new_theme
                    rationale = f"Self-Correction rejected due to hierarchical inconsistency: {audit.feedback} | Original: {res.rationale}"
            
        return {
            "Driver": driver,
            "Sub driver": sub_driver,
            "Sentiment": sentiment,
            "Theme": theme,
            "rationale": rationale
        }