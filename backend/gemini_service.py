import os
import re
import json
import google.generativeai as genai
from dotenv import load_dotenv
from schema_context import SCHEMA_CONTEXT
import coral_client

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path)

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    print("[GeminiService] Warning: GEMINI_API_KEY is not set in environment.")

def get_model(model_name="gemini-3.1-flash-lite"):
    return genai.GenerativeModel(model_name)

def clean_sql(response_text: str) -> str:
    """
    Cleans markdown code block wraps and whitespace from generated SQL queries.
    """
    cleaned = response_text.strip()
    # Strip markdown ```sql / ``` codeblocks
    cleaned = re.sub(r"^```sql\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()

def nl_to_sql(prompt: str, error_context: str = None) -> str:
    """
    Translates user prompt into standard Coral SQL.
    Includes error context if performing self-correction.
    """
    model = get_model()
    
    # Dynamically read active GITHUB_OWNER and GITHUB_REPO from environment variables
    active_owner = os.getenv("GITHUB_OWNER") or "withcoral"
    active_repo = os.getenv("GITHUB_REPO") or "coral"

    system_instruction = (
        f"{SCHEMA_CONTEXT}\n\n"
        f"The user's active GitHub configuration is: owner = '{active_owner}', repository = '{active_repo}'.\n"
        "When generating queries for GitHub pulls (`github.pulls`) or issues (`github.issues`), you MUST use these values "
        f"for the `owner` and `repo` filters (i.e. `owner = '{active_owner}' AND repo = '{active_repo}'`), unless the user explicitly names a different owner/repository in their request.\n\n"
        "Generate a SINGLE valid SQL query to answer the user request. "
        "Return ONLY the SQL query. Do not write explanations. Do not include markdown codeblocks."
    )

    
    user_content = f"User Request: {prompt}"
    if error_context:
        user_content += f"\n\nPrevious attempt failed with error:\n{error_context}\n\nPlease fix the SQL query and try again."

    try:
        response = model.generate_content(
            contents=user_content,
            generation_config={"temperature": 0.0},
            safety_settings=[],
            tools=None
        )
        # Handle system instruction via prompt construction if system_instruction param is not fully supported
        # In current genai SDK, we can pass system_instruction parameter or prepend it.
        # Let's prepend to be highly compatible with older SDK versions.
        full_prompt = f"{system_instruction}\n\n{user_content}"
        response = model.generate_content(full_prompt)
        return clean_sql(response.text)
    except Exception as e:
        print(f"[GeminiService] Error in nl_to_sql: {e}")
        return ""

def execute_nl_query_with_self_correction(prompt: str) -> dict:
    """
    Generates SQL, executes it, and corrects errors (up to 3 tries).
    Returns query execution dictionary.
    """
    current_prompt = prompt
    error_log = None
    last_sql = ""
    
    for attempt in range(3):
        sql = nl_to_sql(current_prompt, error_context=error_log)
        if not sql:
            return {
                "success": False,
                "sql": last_sql,
                "data": [],
                "error": "Failed to generate SQL",
                "cache_status": "MISS",
                "duration_ms": 0,
                "source_status": coral_client.get_sources_health()
            }
        
        last_sql = sql
        print(f"[GeminiService] Attempt {attempt + 1} - Executing SQL: {sql}")
        
        result = coral_client.execute_query(sql)
        
        if result["error"] is None:
            # Success!
            print("[GeminiService] Query succeeded!")
            return {
                "success": True,
                "sql": sql,
                "data": result["data"],
                "error": None,
                "cache_status": result["cache_status"],
                "duration_ms": result["duration_ms"],
                "source_status": result["source_status"]
            }
        
        # Sprintf error for Gemini self-correction
        error_log = f"SQL attempted: {sql}\nError message: {result['error']}"
        print(f"[GeminiService] Query failed on attempt {attempt + 1}: {result['error']}")

    return {
        "success": False,
        "sql": last_sql,
        "data": [],
        "error": f"Failed after 3 attempts. Last error: {result['error']}",
        "cache_status": "MISS",
        "duration_ms": result.get("duration_ms", 0),
        "source_status": coral_client.get_sources_health(errored_query=last_sql, error_msg=result['error'])
    }

def synthesize_answer(prompt: str, sql: str, data: list) -> str:
    """
    Synthesizes raw JSON query data and the user query into a clean, human answer.
    """
    model = get_model()
    data_str = json.dumps(data[:50]) # Cap to avoid context overflow
    
    system_instruction = (
        "You are Navigator, a personal developer intelligence assistant. "
        "Review the SQL query and its JSON output, then write a concise, professional, and friendly answer. "
        "Highlight correlations, priority actions, and cross-source details. "
        "Do not list raw IDs or mention tech details like database tables unless asked."
    )
    
    content = (
        f"{system_instruction}\n\n"
        f"User question: {prompt}\n"
        f"Executed SQL: {sql}\n"
        f"JSON Data:\n{data_str}"
    )
    
    try:
        response = model.generate_content(content)
        return response.text.strip()
    except Exception as e:
        return f"Error synthesizing answer: {e}"

def synthesize_away_summary(diff_data: dict) -> str:
    """
    Synthesizes the localStorage changes into a neat 'While You Were Away' summary.
    """
    model = get_model()
    diff_str = json.dumps(diff_data)
    
    prompt = (
        "You are Navigator. Review the following changes that occurred in the user's workspace "
        "while they were away, and summarize them in 2-3 engaging, conversational sentences. "
        "Focus on new emails, PR changes, overdue tasks, or upcoming meetings.\n\n"
        f"Diff Data:\n{diff_str}"
    )
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        return f"Welcome back! You have new updates on your dashboard. (Error generating summary: {e})"

def synthesize_weekly_rewind(weekly_data: dict) -> str:
    """
    Synthesizes last week's raw accomplishments into a Monday Weekly Rewind paragraph.
    Must be a narrative paragraph (no bullet points).
    """
    model = get_model()
    data_str = json.dumps(weekly_data)
    
    prompt = (
        "You are Navigator. Take the following raw developer stats from the last 7 days and "
        "synthesize them into a single, cohesive, encouraging narrative paragraph (strictly do NOT use bullet points). "
        "Summarize merged PRs, completed tasks, meetings, weather patterns, or articles read. "
        "Start with a friendly reflection on last week's productivity.\n\n"
        f"Weekly Raw Data:\n{data_str}"
    )
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        return f"Last week was highly productive across all sources. You closed out multiple key tasks and PR reviews. (Error: {e})"
