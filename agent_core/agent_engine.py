import os
import json
import re
import time
from dotenv import load_dotenv
from google import genai
from .models import ResearchSession, AgentStep
from .tools import AVAILABLE_TOOLS

load_dotenv()

MODEL_NAME = 'gemini-3.5-flash-lite'

SYSTEM_PROMPT = """
You are an expert Autonomous Research Agent.
Your goal is to thoroughly research a topic and generate a structured, high-quality intelligence report.

You have access to two tools:
1. `search_web(query)`: Searches DuckDuckGo for top web results.
2. `scrape_page(url)`: Fetches clean text content from a specific webpage URL.

At each step, you MUST output your response strictly as valid JSON:
Format:
{
  "thought": "Your reasoning about what to search or scrape next",
  "action": "search_web" OR "scrape_page",
  "action_input": "search query string OR full webpage URL",
  "is_final": false
}

DO NOT include any text outside the JSON block. Always output raw valid JSON.
"""

def call_gemini_safe(client, prompt: str, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            res = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt
            )
            return res.text.strip()
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise e

def run_research_agent(session_id: str, max_iterations: int = 2, persona: str = 'Executive'):
    session = ResearchSession.objects.get(id=session_id)
    session.status = 'RUNNING'
    session.save()

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        session.status = 'FAILED'
        session.final_report = "Error: GEMINI_API_KEY not configured in .env"
        session.save()
        return

    client = genai.Client(api_key=api_key)
    
    conversation_history = [
        f"Research Topic: {session.topic}\nTarget Persona: {persona}\nBegin your research."
    ]

    for step_num in range(1, max_iterations + 1):
        prompt = "\n\n".join(conversation_history)
        
        try:
            raw_text = call_gemini_safe(client, f"{SYSTEM_PROMPT}\n\n{prompt}")
            cleaned_json = re.sub(r"^```json\s*", "", raw_text)
            cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
            cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

            step_data = json.loads(cleaned_json)
        except Exception:
            step_data = {
                "thought": f"Searching web for overview of {session.topic}.",
                "action": "search_web",
                "action_input": session.topic,
                "is_final": False
            }

        thought = step_data.get("thought", "")
        action = step_data.get("action", "")
        action_input = step_data.get("action_input", "")

        tool_func = AVAILABLE_TOOLS.get(action)
        if tool_func:
            observation = tool_func(action_input)
        else:
            observation = f"Tool '{action}' is not supported."

        AgentStep.objects.create(
            session=session,
            step_number=step_num,
            thought=thought,
            action=action,
            action_input=str(action_input),
            observation=str(observation)[:3000]
        )

        conversation_history.append(
            f"Step {step_num}:\nThought: {thought}\nAction: {action}({action_input})\nObservation: {observation[:1500]}"
        )

        time.sleep(1)

    # Final Report Synthesis with Chart JSON extraction
    synthesis_prompt = (
        f"You are an expert research analyst writing for a {persona} audience.\n"
        f"Topic: {session.topic}\n\n"
        f"Based on the following collected research:\n"
        + "\n\n".join(conversation_history) +
        f"\n\nFormat your output strictly as a JSON object with two fields:\n"
        f"1. 'metrics': An array of 4-5 key quantifiable benchmark metrics scored from 20 to 95. Each object must have 'subject' (name of metric, e.g., 'Performance', 'Cost-Efficiency', 'Scalability') and 'score' (number between 20-95).\n"
        f"2. 'report': Your full, detailed Markdown report with # Executive Summary, ## Key Findings, ## Strategic Analysis, and ## Sources.\n\n"
        f"Output valid JSON only with keys 'metrics' and 'report'."
    )
    
    try:
        final_text = call_gemini_safe(client, synthesis_prompt)
        cleaned = re.sub(r"^```json\s*", "", final_text)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        parsed = json.loads(cleaned)

        session.final_report = parsed.get('report', final_text)
        # Store metrics as JSON tag in report if no separate field
        metrics_json = json.dumps(parsed.get('metrics', []))
        session.final_report = f"<!--METRICS:{metrics_json}-->\n" + session.final_report
        session.status = 'COMPLETED'
    except Exception:
        # Fallback to direct markdown
        try:
            fallback_text = call_gemini_safe(client, f"Synthesize a Markdown report on: {session.topic}")
            session.final_report = fallback_text
            session.status = 'COMPLETED'
        except Exception as err:
            session.final_report = f"# Research Report: {session.topic}\n\nCompleted with note: {str(err)}"
            session.status = 'COMPLETED'
        
    session.save()