import os
import time
from datetime import datetime, timedelta
import asyncio
import threading
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv, set_key
import httpx

import coral_client
import gemini_service

# Load env variables
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path)

app = FastAPI(title="Navigator - Personal Developer Intelligence API")

# Configure CORS for local UI development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Onboarding request model
class SetupRequest(BaseModel):
    github_token: Optional[str] = None
    github_owner: Optional[str] = None
    github_repo: Optional[str] = None
    todoist_token: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_refresh_token: Optional[str] = None
    
    # Active source toggles
    enable_github: Optional[bool] = None
    enable_todoist: Optional[bool] = None
    enable_gmail: Optional[bool] = None
    enable_google_calendar: Optional[bool] = None
    enable_open_meteo: Optional[bool] = None
    enable_hn: Optional[bool] = None
    enable_devto: Optional[bool] = None

    # Weather coordinates
    weather_latitude: Optional[float] = None
    weather_longitude: Optional[float] = None

class QueryRequest(BaseModel):
    query: str
    bypass_cache: bool = False

class SqlRequest(BaseModel):
    query: str
    bypass_cache: bool = False

class DiffRequest(BaseModel):
    old_data: dict
    new_data: dict

# Active Snooze state
snooze_until = 0.0

@app.get("/api/github/repos")
async def get_github_repos(token: Optional[str] = None):
    """
    Fetches the authenticated user's repositories from GitHub.
    Uses the provided token, or falls back to GITHUB_TOKEN in env.
    """
    github_token = token or os.getenv("GITHUB_TOKEN")
    if not github_token:
        raise HTTPException(status_code=400, detail="GitHub Token is missing.")

    url = "https://api.github.com/user/repos?per_page=100&sort=updated"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Navigator-App"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"GitHub API error: {response.text}")
            
            repos = response.json()
            result = []
            for r in repos:
                result.append({
                    "owner": r.get("owner", {}).get("login"),
                    "name": r.get("name"),
                    "full_name": r.get("full_name")
                })
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch repositories: {e}")

@app.get("/api/github/pulls")
async def get_github_pulls():
    """
    Fetches open pull requests authored by the authenticated user across all repositories directly from the GitHub API.
    """
    github_token = os.getenv("GITHUB_TOKEN")
    if not github_token:
        raise HTTPException(status_code=400, detail="GitHub Token is missing.")
    
    url = "https://api.github.com/search/issues?q=is:open+is:pr+author:@me&per_page=5"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Navigator-App"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"GitHub API error: {response.text}")
            
            data = response.json()
            pulls = data.get("items", [])
            result = []
            for p in pulls:
                html_url = p.get("html_url", "")
                repo_name = ""
                if html_url:
                    parts = html_url.split("/")
                    if len(parts) >= 5:
                        repo_name = f"{parts[-4]}/{parts[-3]}"
                
                result.append({
                    "number": p.get("number"),
                    "title": p.get("title"),
                    "state": p.get("state"),
                    "user__login": p.get("user", {}).get("login"),
                    "html_url": html_url,
                    "repo_name": repo_name
                })
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pull requests: {e}")

@app.post("/api/setup")
async def setup_credentials(req: SetupRequest):
    """
    Saves user tokens into the .env file and forces Coral source re-configuration.
    """
    try:
        # Write to .env
        if req.github_token:
            set_key(dotenv_path, "GITHUB_TOKEN", req.github_token)
        if req.github_owner is not None:
            set_key(dotenv_path, "GITHUB_OWNER", req.github_owner)
        if req.github_repo is not None:
            set_key(dotenv_path, "GITHUB_REPO", req.github_repo)
        if req.todoist_token:
            set_key(dotenv_path, "TODOIST_API_TOKEN", req.todoist_token)
        if req.google_client_id:
            set_key(dotenv_path, "GOOGLE_CLIENT_ID", req.google_client_id)
        if req.google_client_secret:
            set_key(dotenv_path, "GOOGLE_CLIENT_SECRET", req.google_client_secret)
        if req.google_refresh_token:
            set_key(dotenv_path, "GOOGLE_REFRESH_TOKEN", req.google_refresh_token)

        # Save toggles
        if req.enable_github is not None:
            set_key(dotenv_path, "ENABLE_GITHUB", "true" if req.enable_github else "false")
        if req.enable_todoist is not None:
            set_key(dotenv_path, "ENABLE_TODOIST", "true" if req.enable_todoist else "false")
        if req.enable_gmail is not None:
            set_key(dotenv_path, "ENABLE_GMAIL", "true" if req.enable_gmail else "false")
        if req.enable_google_calendar is not None:
            set_key(dotenv_path, "ENABLE_GOOGLE_CALENDAR", "true" if req.enable_google_calendar else "false")
        if req.enable_open_meteo is not None:
            set_key(dotenv_path, "ENABLE_OPEN_METEO", "true" if req.enable_open_meteo else "false")
        if req.enable_hn is not None:
            set_key(dotenv_path, "ENABLE_HN", "true" if req.enable_hn else "false")
        if req.enable_devto is not None:
            set_key(dotenv_path, "ENABLE_DEVTO", "true" if req.enable_devto else "false")
        if req.weather_latitude is not None:
            set_key(dotenv_path, "WEATHER_LATITUDE", str(req.weather_latitude))
        if req.weather_longitude is not None:
            set_key(dotenv_path, "WEATHER_LONGITUDE", str(req.weather_longitude))

        # Reload env in python process
        load_dotenv(dotenv_path, override=True)

        # Invalidate installed cache to force reinstall
        coral_client._installed_tokens = {
            "gmail": None, "google_calendar": None, "github": None, "todoist": None
        }
        coral_client._google_tokens = {
            "gmail": {"access_token": None, "expiry": 0.0},
            "google_calendar": {"access_token": None, "expiry": 0.0}
        }

        # Force dynamic re-registration
        coral_client.sync_source_credentials_if_needed()

        return {"status": "success", "message": "Credentials updated and sources re-configured."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save credentials: {e}")

@app.post("/api/query")
async def query_endpoint(req: QueryRequest):
    """
    Translates Natural Language prompt into SQL and executes it with self-correction.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is missing. Configure it in Onboarding.")

    try:
        # Check cache-bypass
        if req.bypass_cache:
            result = gemini_service.execute_nl_query_with_self_correction(req.query)
        else:
            # Let execute_nl_query_with_self_correction handle caching inside coral_client
            result = gemini_service.execute_nl_query_with_self_correction(req.query)

        if not result["success"]:
            return {
                "success": False,
                "sql": result["sql"],
                "error": result["error"],
                "answer": f"I couldn't run that query successfully. Error details: {result['error']}",
                "data": [],
                "duration_ms": result["duration_ms"],
                "cache_status": result["cache_status"],
                "source_status": result["source_status"]
            }

        # Synthesize answer
        answer = gemini_service.synthesize_answer(req.query, result["sql"], result["data"])
        
        return {
            "success": True,
            "sql": result["sql"],
            "data": result["data"],
            "answer": answer,
            "duration_ms": result["duration_ms"],
            "cache_status": result["cache_status"],
            "source_status": result["source_status"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sql")
async def sql_endpoint(req: SqlRequest):
    """
    Executes a raw SQL query directly against the Coral client without Gemini translation.
    """
    try:
        result = coral_client.execute_query(req.query, bypass_cache=req.bypass_cache)
        return {
            "success": result["error"] is None,
            "data": result["data"],
            "error": result["error"],
            "duration_ms": result["duration_ms"],
            "cache_status": result["cache_status"],
            "source_status": result["source_status"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/focus")
async def get_focus_card(latitude: Optional[float] = None, longitude: Optional[float] = None, bypass_cache: bool = False):
    """
    Queries Todoist tasks and returns the highest priority active item as a focus recommendation.
    Also returns current weather status (Open-Meteo) and calendar events today for context.
    """
    # 1. Fetch high priority task
    task_sql = "SELECT id, content, priority, due__date FROM todoist.tasks WHERE checked = false ORDER BY priority DESC, due__date ASC LIMIT 1"
    task_res = coral_client.execute_query(task_sql, bypass_cache=bypass_cache)

    # 2. Fetch current weather (dummy lat/long if not set)
    lat = latitude
    if lat is None:
        try:
            lat_str = os.getenv("WEATHER_LATITUDE")
            if lat_str:
                lat = float(lat_str)
        except ValueError:
            pass
    if lat is None:
        lat = 40.7128

    lon = longitude
    if lon is None:
        try:
            lon_str = os.getenv("WEATHER_LONGITUDE")
            if lon_str:
                lon = float(lon_str)
        except ValueError:
            pass
    if lon is None:
        lon = -74.0060

    weather_sql = f"SELECT current_temperature_2m, current_wind_speed_10m, current_weather_code FROM open_meteo.forecast WHERE latitude = {lat} AND longitude = {lon} AND current = 'temperature_2m,wind_speed_10m,weather_code' LIMIT 1"
    weather_res = coral_client.execute_query(weather_sql, bypass_cache=bypass_cache)

    # 3. Fetch today's events
    today_str = datetime.utcnow().strftime("%Y-%m-%dT00:00:00Z")
    tomorrow_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    cal_sql = f"SELECT summary, start_date_time, end_date_time FROM google_calendar.events WHERE single_events = true AND time_min = '{today_str}' AND time_max = '{tomorrow_str}' ORDER BY start_date_time ASC LIMIT 5"
    cal_res = coral_client.execute_query(cal_sql, bypass_cache=bypass_cache)

    focus_task = task_res["data"][0] if task_res["data"] else {"content": "No active tasks. Take a break!", "priority": 1, "due__date": None}
    weather = weather_res["data"][0] if weather_res["data"] else {"current_temperature_2m": None, "current_wind_speed_10m": None, "current_weather_code": None}
    calendar_events = cal_res["data"]

    # Combine metrics
    duration = max(task_res["duration_ms"], weather_res["duration_ms"], cal_res["duration_ms"])
    cache_status = "HIT" if (task_res["cache_status"] == "HIT" and weather_res["cache_status"] == "HIT") else "MISS"

    return {
        "focus_task": focus_task,
        "weather": weather,
        "events": calendar_events,
        "execution_metadata": {
            "time_ms": duration,
            "cache_status": cache_status
        },
        "source_status": task_res["source_status"]
    }

@app.get("/api/health")
async def get_day_health(bypass_cache: bool = False):
    """
    Calculates the Day Health Score (0-100) based on unread emails, open tasks, calendar load, and weather.
    """
    # Active high-priority tasks (Todoist)
    tasks_res = coral_client.execute_query("SELECT COUNT(*) as cnt FROM todoist.tasks WHERE checked = false AND priority = 4", bypass_cache)
    # Unread messages (Gmail)
    unread_res = coral_client.execute_query("SELECT COUNT(*) as cnt FROM gmail.messages WHERE label_ids = 'UNREAD'", bypass_cache)
    # Today's meetings (Calendar)
    today_str = datetime.utcnow().strftime("%Y-%m-%dT00:00:00Z")
    tomorrow_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    meetings_res = coral_client.execute_query(f"SELECT COUNT(*) as cnt FROM google_calendar.events WHERE single_events = true AND time_min = '{today_str}' AND time_max = '{tomorrow_str}'", bypass_cache)

    # Extract counts
    try:
        tasks_count = tasks_res["data"][0]["cnt"] if tasks_res["data"] else 0
    except Exception:
        tasks_count = 0

    try:
        unread_count = unread_res["data"][0]["cnt"] if unread_res["data"] else 0
    except Exception:
        unread_count = 0

    try:
        meetings_count = meetings_res["data"][0]["cnt"] if meetings_res["data"] else 0
    except Exception:
        meetings_count = 0

    # Health score algorithm: start at 100
    # Deduct 10 per urgent task (max 40)
    # Deduct 5 per unread email (max 30)
    # Deduct 5 per meeting over 3 meetings (max 30)
    score = 100 - (tasks_count * 10) - (unread_count * 5) - (max(0, meetings_count - 3) * 5)
    score = max(0, min(100, score))

    duration = max(tasks_res["duration_ms"], unread_res["duration_ms"], meetings_res["duration_ms"])
    cache_status = "HIT" if (tasks_res["cache_status"] == "HIT" and unread_res["cache_status"] == "HIT" and meetings_res["cache_status"] == "HIT") else "MISS"

    return {
        "score": score,
        "metrics": {
            "urgent_tasks": tasks_count,
            "unread_emails": unread_count,
            "meetings_count": meetings_count
        },
        "execution_metadata": {
            "time_ms": duration,
            "cache_status": cache_status
        },
        "source_status": tasks_res["source_status"]
    }

@app.post("/api/snooze")
async def start_smart_snooze():
    """
    Snoozes alerts until the end of the user's current or next calendar meeting.
    """
    global snooze_until
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # Query Google Calendar for the end time of the active or next event
    sql = (
        f"SELECT end_date_time, summary FROM google_calendar.events "
        f"WHERE single_events = true AND end_date_time > '{now_str}' "
        f"ORDER BY start_date_time ASC LIMIT 1"
    )
    result = coral_client.execute_query(sql, bypass_cache=True)
    
    if result["data"]:
        event = result["data"][0]
        end_time_str = event["end_date_time"]
        # Convert timestamp to epoch float
        try:
            # Example: 2026-05-29T16:00:00Z
            dt = datetime.strptime(end_time_str.split(".")[0].replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
            snooze_until = dt.timestamp()
            formatted_time = dt.strftime("%I:%M %p")
            return {"status": "snoozed", "until": formatted_time, "event": event["summary"]}
        except Exception as ex:
            print(f"[SmartSnooze] Timestamp conversion failed: {ex}")
    
    # Fallback to 1 hour if no meetings found
    snooze_until = time.time() + 3600
    formatted_time = datetime.fromtimestamp(snooze_until).strftime("%I:%M %p")
    return {"status": "snoozed", "until": formatted_time, "event": "Fallback (1 hr)"}

@app.get("/api/snooze/status")
async def get_snooze_status():
    global snooze_until
    is_active = time.time() < snooze_until
    return {
        "active": is_active,
        "until": datetime.fromtimestamp(snooze_until).strftime("%I:%M %p") if is_active else None
    }

@app.post("/api/summary")
async def generate_diff_summary(req: DiffRequest):
    """
    Computes differences between previous loaded states and current states.
    Uses Gemini to synthesize the changes.
    """
    # req.old_data and req.new_data contain lists of emails, tasks, PRs, etc.
    # We will generate a structured diff dictionary.
    diff = {
        "new_emails": [],
        "changed_prs": [],
        "overdue_tasks": [],
        "upcoming_meetings": []
    }
    
    # 1. New Emails
    old_msg_ids = {msg.get("id") for msg in req.old_data.get("emails", [])}
    for msg in req.new_data.get("emails", []):
        if msg.get("id") not in old_msg_ids:
            diff["new_emails"].append(msg.get("snippet", "New email received"))

    # 2. PR Changes
    old_pr_states = {pr.get("number"): pr.get("state") for pr in req.old_data.get("prs", [])}
    for pr in req.new_data.get("prs", []):
        old_state = old_pr_states.get(pr.get("number"))
        if old_state and old_state != pr.get("state"):
            diff["changed_prs"].append(f"PR #{pr.get('number')} '{pr.get('title')}' state changed to {pr.get('state')}")
        elif not old_state:
            diff["changed_prs"].append(f"New PR #{pr.get('number')} '{pr.get('title')}' created")

    # 3. Overdue Tasks
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    for task in req.new_data.get("tasks", []):
        due_date = task.get("due__date")
        if due_date and due_date < now_str and not task.get("checked"):
            diff["overdue_tasks"].append(task.get("content"))

    # 4. Meetings within 2 hours
    limit_time = datetime.utcnow() + timedelta(hours=2)
    for meeting in req.new_data.get("events", []):
        start_time_str = meeting.get("start_date_time")
        if start_time_str:
            try:
                dt = datetime.strptime(start_time_str.split(".")[0].replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
                if datetime.utcnow() < dt <= limit_time:
                    diff["upcoming_meetings"].append(f"{meeting.get('summary')} starting at {dt.strftime('%H:%M')}")
            except Exception:
                pass

    summary = gemini_service.synthesize_away_summary(diff)
    return {"summary": summary}

@app.get("/api/rewind")
async def get_weekly_rewind(bypass_cache: bool = False):
    """
    Gathers last 7 days of developer operations and synthesizes a Weekly Rewind.
    """
    last_week = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00Z")
    
    # 1. Closed PRs
    owner = os.getenv("GITHUB_OWNER") or "withcoral"
    repo = os.getenv("GITHUB_REPO") or "coral"
    pr_res = coral_client.execute_query(f"SELECT number, title FROM github.pulls WHERE owner = '{owner}' AND repo = '{repo}' AND state = 'closed' LIMIT 10", bypass_cache)
    
    # 2. Gmail count
    gmail_res = coral_client.execute_query(f"SELECT count(*) as cnt FROM gmail.messages LIMIT 100", bypass_cache)

    # 3. Todoist Tasks Completed
    todoist_res = coral_client.execute_query(f"SELECT content FROM todoist.tasks WHERE checked = true LIMIT 50", bypass_cache)

    # 4. Meeting Load
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    cal_res = coral_client.execute_query(f"SELECT summary, start_date_time, end_date_time FROM google_calendar.events WHERE single_events = true AND start_date_time >= '{last_week}' AND end_date_time <= '{now_str}'", bypass_cache)

    # Build weekly raw packet
    stats = {
        "merged_prs_count": len(pr_res["data"]),
        "emails_received": gmail_res["data"][0]["cnt"] if (gmail_res["data"] and "cnt" in gmail_res["data"][0]) else len(gmail_res["data"]),
        "tasks_completed_count": len(todoist_res["data"]),
        "meetings": [evt.get("summary") for evt in cal_res["data"][:15]]
    }

    summary = gemini_service.synthesize_weekly_rewind(stats)
    return {"summary": summary}

# Import bot module inside start thread to prevent circular imports
def run_telegram_bot():
    import bot
    bot.start_bot()

@app.on_event("startup")
def startup_event():
    # Start bot thread
    print("[Main] Starting Telegram Bot thread...")
    bot_thread = threading.Thread(target=run_telegram_bot, daemon=True)
    bot_thread.start()
    print("[Main] Telegram Bot thread spawned successfully.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
