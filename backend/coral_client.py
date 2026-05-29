import os
import subprocess
import json
import time
import hashlib
import httpx
import re
from dotenv import load_dotenv

# Load env file
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path)

# In-memory caches
_query_cache = {}  # query_hash -> {"data": list, "timestamp": float, "duration_ms": float}
_google_tokens = {
    "gmail": {"access_token": None, "expiry": 0.0},
    "google_calendar": {"access_token": None, "expiry": 0.0}
}
_installed_tokens = {
    "gmail": None,
    "google_calendar": None,
    "github": None,
    "todoist": None
}

CACHE_TTL = 300.0  # 5 minutes

def is_source_enabled(source: str) -> bool:
    """
    Checks if a source is explicitly enabled or disabled in the environment.
    If not explicitly configured, defaults based on credential presence.
    """
    env_val = os.getenv(f"ENABLE_{source.upper()}")
    if env_val is not None:
        return env_val.lower() == "true"
    
    # Defaults for credentialed sources
    if source == "github":
        return bool(os.getenv("GITHUB_TOKEN"))
    if source in ["gmail", "google_calendar"]:
        return bool(os.getenv("GOOGLE_REFRESH_TOKEN"))
    if source == "todoist":
        return bool(os.getenv("TODOIST_API_TOKEN"))
    
    return True

def get_google_access_token():
    """
    Refresh Google OAuth access tokens using the refresh token from .env
    Returns (access_token, expiry_timestamp) or (None, None)
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        print("[CoralClient] Google OAuth credentials missing in .env")
        return None

    # Use Google's OAuth 2.0 token endpoint to refresh
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }

    try:
        response = httpx.post(url, data=data)
        if response.status_code == 200:
            res_json = response.json()
            access_token = res_json.get("access_token")
            expires_in = res_json.get("expires_in", 3600)
            expiry = time.time() + expires_in - 60  # Buffer of 1 min
            return access_token, expiry
        else:
            print(f"[CoralClient] Failed to refresh Google token: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"[CoralClient] Error refreshing Google token: {e}")
        return None

def get_cleaned_manifest_path(source_name, original_path):
    """
    Reads the original manifest, removes unsupported credential blocks/filter descriptions
    for schema compatibility with the installed Coral CLI binary, and writes a cleaned
    copy inside the untracked navigator folder.
    """
    try:
        with open(original_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Remove credential block
        content = re.sub(r'[ \t]*credential:\s*methods:.*?(?=base_url:)', '', content, flags=re.DOTALL)

        # For google_calendar, also remove the invalid description on filter
        if source_name == "google_calendar":
            content = content.replace("        description: URL-safe calendar ID, such as calendars.events_calendar_id\n", "")
            # Inject single_events, time_min, and time_max virtual filter columns under events table columns list
            target_str = "    columns:\n      - name: calendar_id"
            virtual_cols = (
                "    columns:\n"
                "      - name: single_events\n"
                "        type: Boolean\n"
                "        nullable: true\n"
                "        description: Virtual filter column for singleEvents\n"
                "        expr:\n"
                "          kind: from_filter\n"
                "          key: single_events\n"
                "      - name: time_min\n"
                "        type: Utf8\n"
                "        nullable: true\n"
                "        description: Virtual filter column for timeMin\n"
                "        expr:\n"
                "          kind: from_filter\n"
                "          key: time_min\n"
                "      - name: time_max\n"
                "        type: Utf8\n"
                "        nullable: true\n"
                "        description: Virtual filter column for timeMax\n"
                "        expr:\n"
                "          kind: from_filter\n"
                "          key: time_max\n"
                "      - name: calendar_id"
            )
            content = content.replace(target_str, virtual_cols)

        # Write to temp path inside navigator directory
        temp_dir = os.path.join(os.path.dirname(__file__), "manifests")
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"{source_name}.yaml")
        
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        return f"navigator/backend/manifests/{source_name}.yaml"
    except Exception as e:
        print(f"[CoralClient] Failed to clean manifest for {source_name}: {e}")
        return original_path

def sync_source_credentials_if_needed():
    """
    Checks if active credentials have changed or expired, and updates Coral in WSL.
    """
    global _google_tokens, _installed_tokens

    # 1. Google OAuth
    current_time = time.time()
    gmail_token = _google_tokens["gmail"]["access_token"]
    gmail_expiry = _google_tokens["gmail"]["expiry"]

    if (is_source_enabled("gmail") or is_source_enabled("google_calendar")) and (not gmail_token or current_time >= gmail_expiry):
        tokens = get_google_access_token()
        if tokens:
            access_token, expiry = tokens
            _google_tokens["gmail"] = {"access_token": access_token, "expiry": expiry}
            _google_tokens["google_calendar"] = {"access_token": access_token, "expiry": expiry}

    # Retrieve current active env configurations
    active_gmail = _google_tokens["gmail"]["access_token"]
    active_gcal = _google_tokens["google_calendar"]["access_token"]
    active_github = os.getenv("GITHUB_TOKEN")
    active_todoist = os.getenv("TODOIST_API_TOKEN")

    # Install Gmail
    if is_source_enabled("gmail") and active_gmail and active_gmail != _installed_tokens["gmail"]:
        print("[CoralClient] Re-configuring Gmail source in WSL...")
        cleaned_path = get_cleaned_manifest_path("gmail", "sources/community/gmail/manifest.yaml")
        cmd = f"GMAIL_ACCESS_TOKEN='{active_gmail}' coral source add --file {cleaned_path}"
        proc = subprocess.run(["wsl", "bash", "-ic", cmd], capture_output=True, text=True)
        if proc.returncode == 0:
            _installed_tokens["gmail"] = active_gmail
            print("[CoralClient] Gmail source configured successfully.")
        else:
            print(f"[CoralClient] Failed to configure Gmail: {proc.stderr}")

    # Install Google Calendar
    if is_source_enabled("google_calendar") and active_gcal and active_gcal != _installed_tokens["google_calendar"]:
        print("[CoralClient] Re-configuring Google Calendar source in WSL...")
        cleaned_path = get_cleaned_manifest_path("google_calendar", "sources/core/google_calendar/manifest.yaml")
        cmd = f"GOOGLE_CALENDAR_ACCESS_TOKEN='{active_gcal}' GOOGLE_CALENDAR_API_BASE='https://www.googleapis.com/calendar/v3' coral source add --file {cleaned_path}"
        proc = subprocess.run(["wsl", "bash", "-ic", cmd], capture_output=True, text=True)
        if proc.returncode == 0:
            _installed_tokens["google_calendar"] = active_gcal
            print("[CoralClient] Google Calendar source configured successfully.")
        else:
            print(f"[CoralClient] Failed to configure Google Calendar: {proc.stderr}")

    # Install GitHub
    if is_source_enabled("github") and active_github and active_github != _installed_tokens["github"]:
        print("[CoralClient] Re-configuring GitHub source in WSL...")
        cmd = f"GITHUB_TOKEN='{active_github}' coral source add github"
        proc = subprocess.run(["wsl", "bash", "-ic", cmd], capture_output=True, text=True)
        if proc.returncode == 0:
            _installed_tokens["github"] = active_github
            print("[CoralClient] GitHub source configured successfully.")
        else:
            print(f"[CoralClient] Failed to configure GitHub: {proc.stderr}")

    # Install Todoist
    if is_source_enabled("todoist") and active_todoist and active_todoist != _installed_tokens["todoist"]:
        print("[CoralClient] Re-configuring Todoist source in WSL...")
        cmd = f"TODOIST_API_TOKEN='{active_todoist}' coral source add --file sources/community/todoist/manifest.yaml"
        proc = subprocess.run(["wsl", "bash", "-ic", cmd], capture_output=True, text=True)
        if proc.returncode == 0:
            _installed_tokens["todoist"] = active_todoist
            print("[CoralClient] Todoist source configured successfully.")
        else:
            print(f"[CoralClient] Failed to configure Todoist: {proc.stderr}")

def query_coral_raw(sql_query: str) -> str:
    """
    Executes a query directly on the Coral CLI inside WSL.
    Raises RuntimeError on error.
    """
    # Pre-configure environment variables for query context
    gmail_tok = _google_tokens["gmail"]["access_token"] or ""
    gcal_tok = _google_tokens["google_calendar"]["access_token"] or ""
    github_tok = os.getenv("GITHUB_TOKEN", "")
    todoist_tok = os.getenv("TODOIST_API_TOKEN", "")

    # Construct execution command
    escaped_sql = sql_query.replace("'", "'\\''")
    cmd = (
        f"GMAIL_ACCESS_TOKEN='{gmail_tok}' "
        f"GOOGLE_CALENDAR_ACCESS_TOKEN='{gcal_tok}' "
        f"GITHUB_TOKEN='{github_tok}' "
        f"TODOIST_API_TOKEN='{todoist_tok}' "
        f"coral sql --format json '{escaped_sql}'"
    )

    proc = subprocess.run(["wsl", "bash", "-ic", cmd], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or f"Exit code {proc.returncode}")
    
    return proc.stdout.strip()

def execute_query(sql_query: str, bypass_cache: bool = False) -> dict:
    """
    Executes a query with caching, timing, and error handling.
    Returns a dict with:
      "data": parsed JSON response or []
      "duration_ms": time taken
      "cache_status": "HIT" | "MISS"
      "error": str or None
      "source_status": dict of source -> status (healthy/degraded/disabled)
    """
    # Check if the query references any disabled sources
    lowered_sql = sql_query.lower()
    for src in ["github", "gmail", "google_calendar", "todoist", "hn", "devto", "open_meteo"]:
        if (f"{src}." in lowered_sql or f" {src} " in lowered_sql) and not is_source_enabled(src):
            return {
                "data": [],
                "duration_ms": 0.0,
                "cache_status": "MISS",
                "error": f"Source {src} is disabled",
                "source_status": get_sources_health()
            }

    # Dynamic synchronization of credentials
    try:
        sync_source_credentials_if_needed()
    except Exception as e:
        print(f"[CoralClient] Credentials sync failed: {e}")

    query_hash = hashlib.sha256(sql_query.encode("utf-8")).hexdigest()
    now = time.time()

    # Cache hit
    if not bypass_cache and query_hash in _query_cache:
        cached = _query_cache[query_hash]
        if now - cached["timestamp"] < CACHE_TTL:
            return {
                "data": cached["data"],
                "duration_ms": cached["duration_ms"],
                "cache_status": "HIT",
                "error": None,
                "source_status": get_sources_health()
            }

    # Cache miss
    start_time = time.perf_counter()
    try:
        output_str = query_coral_raw(sql_query)
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        
        # Parse JSON
        if not output_str:
            data = []
        else:
            try:
                data = json.loads(output_str)
            except json.JSONDecodeError:
                # Sometimes a single object is returned instead of a list
                data = [json.loads(output_str)]

        # Save to cache
        _query_cache[query_hash] = {
            "data": data,
            "timestamp": now,
            "duration_ms": 1.0  # Serving from cache next time will be 1ms
        }

        return {
            "data": data,
            "duration_ms": round(duration_ms, 2),
            "cache_status": "MISS",
            "error": None,
            "source_status": get_sources_health()
        }
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        error_msg = str(e)
        print(f"[CoralClient] Query error: {error_msg}")
        return {
            "data": [],
            "duration_ms": round(duration_ms, 2),
            "cache_status": "MISS",
            "error": error_msg,
            "source_status": get_sources_health(errored_query=sql_query, error_msg=error_msg)
        }

def get_sources_health(errored_query=None, error_msg=None) -> dict:
    """
    Returns the health status of each source.
    If a query failed, we mark the source involved as degraded.
    """
    health = {}
    for src in ["github", "gmail", "google_calendar", "todoist", "hn", "devto", "open_meteo"]:
        if not is_source_enabled(src):
            health[src] = "disabled"
        elif src == "github":
            health[src] = "healthy" if os.getenv("GITHUB_TOKEN") else "degraded"
        elif src in ["gmail", "google_calendar"]:
            health[src] = "healthy" if os.getenv("GOOGLE_REFRESH_TOKEN") else "degraded"
        elif src == "todoist":
            health[src] = "healthy" if os.getenv("TODOIST_API_TOKEN") else "degraded"
        else:
            health[src] = "healthy"

    # Infer health degradation from query errors
    if errored_query and error_msg:
        lowered_query = errored_query.lower()
        lowered_err = error_msg.lower()
        if "401" in lowered_err or "authentication failed" in lowered_err or "unauthorized" in lowered_err or "bad credentials" in lowered_err:
            for source in ["github", "gmail", "google_calendar", "todoist"]:
                if source in lowered_query and health[source] != "disabled":
                    health[source] = "degraded"
        else:
            # Network failures or other errors
            for source in ["github", "gmail", "google_calendar", "todoist", "hn", "devto", "open_meteo"]:
                if source in lowered_query and health[source] != "disabled":
                    health[source] = "degraded"

    return health
