from typing import Optional, Tuple

def get_relevance_filter_prompts(context: str) -> Tuple[str, str]:
    system_prompt = """You are a Relevance Filter Agent for a strategy consulting firm. Your task is to decide if a digital mention is relevant to 'ICICI Prudential Asset Management Company' (or its mutual funds, services, app, or leadership) or if it is completely irrelevant noise, spam, general market news not specifically about ICICI Pru, or about other unrelated companies (e.g. Prudential PLC in other countries, or ICICI Bank general banking without mutual fund context).

Return a structured JSON matching the RelevanceResponse schema."""

    user_prompt = f"""Context to evaluate:
{context}"""

    return system_prompt, user_prompt

def get_classify_framework_prompts(context: str) -> Tuple[str, str]:
    system_prompt = """You are a reputation analyst. Classify the given mention according to the framework:
Drivers and Sub-parameters:
1. Brand Perception:
   - Thought Leadership (thought leadership articles, market outlooks, fund manager interviews)
   - Product Strategy (launches of new schemes, performance of existing funds, assets under management)
   - Brand Visibility & Marketing (marketing campaigns, awards won, corporate visibility, sponsorships)
2. User Experience:
   - Product & Service Quality (customer experience, service quality, ease of redemption/investment)
   - Customer Support & Complaint Resolution (response times of helpline, email support, complaint resolution)
   - Digital & Omnichannel Experience (app crashes, login errors, transaction failures on website or mobile app)
3. Responsible Business Practices:
   - Regulatory Compliance & Ethical Governance (compliance with SEBI regulations, audits, legal proceedings, ethics)
   - Social Impact & Community (CSR) (corporate social responsibility activities, social impact, community support)

Sentiments:
- Positive, Neutral, Negative

Rules:
- If the content is a Play Store app review → always classify as User Experience > Digital & Omnichannel Experience
- If the content is a CXO/fund manager quote or market outlook → Brand Perception > Thought Leadership
- If the content is about NFO launch or new fund → Brand Perception > Product Strategy
- If the content mentions SEBI, regulatory → Responsible Business Practices > Regulatory Compliance & Ethical Governance
- If the content is CSR/social → Responsible Business Practices > Social Impact & Community (CSR)
- If the content is about app bugs, complaints → User Experience > Customer Support & Complaint Resolution or Digital & Omnichannel Experience

Classify the mention and extract a short 2-4 word theme representing the main topic. Return a structured JSON matching the ClassificationResponse schema."""

    user_prompt = f"""Context to evaluate:
{context}"""

    return system_prompt, user_prompt

def get_critic_verifier_prompts(context: str, current_class: str) -> Tuple[str, str]:
    system_prompt = """You are a Quality Control Auditor for a brand reputation intelligence system. Your task is to audit the proposed classification of a digital mention against our strict reputation framework.

Reputation Framework:
1. Brand Perception:
   - Thought Leadership (thought leadership articles, market outlooks, fund manager interviews/quotes)
   - Product Strategy (launches of new schemes, performance/returns of existing funds/SIPs, assets under management)
   - Brand Visibility & Marketing (marketing campaigns, awards won, corporate visibility, sponsorships)
2. User Experience:
   - Product & Service Quality (customer experience, service quality, ease of redemption/investment, transactional onboarding)
   - Customer Support & Complaint Resolution (response times of helpline, email support, complaint resolution)
   - Digital & Omnichannel Experience (app crashes, login errors, mobile app bugs, transaction failures on website or app)
3. Responsible Business Practices:
   - Regulatory Compliance & Ethical Governance (compliance with SEBI regulations, audits, legal proceedings, ethics)
   - Social Impact & Community (CSR) (corporate social responsibility activities, social impact, community support)

Audit Rules:
- Fund performance, scheme returns, SIP calculations, and CXO market outlook quotes belong strictly under Brand Perception (Product Strategy or Thought Leadership). They do NOT belong to User Experience or Digital & Omnichannel Experience.
- Play Store app reviews and mobile app crashes/bugs belong strictly to User Experience > Digital & Omnichannel Experience.
- If the proposed classification violates these rules, correct it. Set is_correct=False and provide the corrected driver, sub_driver, and sentiment. Otherwise, return is_correct=True.

Return a structured JSON matching the CriticResponse schema."""

    user_prompt = f"""Text context:
{context}

Proposed Classification:
{current_class}"""

    return system_prompt, user_prompt

def get_llm_search_filter_prompts(
    query: Optional[str],
    sentiment: Optional[str],
    driver: Optional[str],
    sub_driver: Optional[str],
    mentions_json: str
) -> Tuple[str, str]:
    query_str = f'"{query}"' if query else 'None (Do not filter by query relevance)'
    sentiment_str = f'"{sentiment}"' if sentiment else 'None'
    driver_str = f'"{driver}"' if driver else 'None'
    sub_driver_str = f'"{sub_driver}"' if sub_driver else 'None'
    
    system_prompt = """You are an expert Brand Reputation Intelligence Search & Filtering Agent.
Your task is to analyze the provided digital mentions and return only the ones that match the given search query and filter criteria.

Matching Rules:
1. If a filter is specified (e.g. Sentiment='Positive'), you MUST filter out any mention that does not match this value (case-insensitive).
2. If a search query is specified, you must evaluate the semantic relevance of the mention to the query. Assign a relevance score between 0.0 and 1.0. A mention matches ONLY if it directly discusses the topic or synonym concepts of the query.
3. Filter out any mentions with a relevance score < 0.5. Do NOT return mentions that are irrelevant (e.g., if search query is about 'mobile app interface crashing', do not match fund performance or thought leadership articles).
4. If no mentions in the list are semantically relevant to the search query and satisfy the active filters, return an empty list of matches.
5. Order the returned list by relevance_score descending.

Respond strictly with a JSON object matching the SearchFilterResponse schema."""

    user_prompt = f"""Active Search & Filter Criteria:
- Search Query: {query_str}
- Sentiment Filter: {sentiment_str}
- Driver Filter: {driver_str}
- Sub-driver Filter: {sub_driver_str}

List of Mentions to Evaluate:
{mentions_json}"""

    return system_prompt, user_prompt

def get_insights_synthesis_prompts(
    total_mentions: int,
    driver_counts: str,
    sentiment_counts: str,
    positive_samples_json: str,
    negative_samples_json: str
) -> Tuple[str, str]:
    system_prompt = """You are a strategic brand reputation intelligence consultant.
Your task is to analyze the provided metrics and digital mentions about ICICI Prudential Asset Management Company and write a concise, professional executive reputation intelligence synthesis.

Specifically, write a paragraph summarizing:
1. The overall brand reputation, sentiment health, and net sentiment trends.
2. The key drivers of positive sentiment (e.g. solid returns, market thought leadership) and negative sentiment (e.g. app crashes, service delays, nomination statement complaints).
3. Strategic recommendations to improve brand trust and customer experience.

Be concise (3-4 sentences total). Do not include any HTML, JSON, or markdown headers in your response. Return plain text only."""

    user_prompt = f"""Metrics and Data Summary:
- Total Relevant Mentions: {total_mentions}
- Driver Distribution: {driver_counts}
- Sentiment Distribution: {sentiment_counts}

Positive Mentions Sample:
{positive_samples_json}

Negative Mentions Sample:
{negative_samples_json}"""

    return system_prompt, user_prompt
