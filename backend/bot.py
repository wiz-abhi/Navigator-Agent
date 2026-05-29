import os
import asyncio
from datetime import datetime
import time
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv

import coral_client
import gemini_service

# Load env
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

async def focus_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/focus - Returns current focus task recommendation"""
    await update.message.reply_chat_action("typing")
    
    # Query Todoist tasks
    task_sql = "SELECT content, priority, due__date FROM todoist.tasks WHERE checked = false ORDER BY priority DESC, due__date ASC LIMIT 1"
    result = coral_client.execute_query(task_sql)
    
    if result["data"]:
        task = result["data"][0]
        priority_map = {1: "Normal", 2: "Medium", 3: "High", 4: "Urgent"}
        priority_label = priority_map.get(task.get("priority", 1), "Normal")
        due = task.get("due__date", "No due date")
        msg = (
            f"🎯 *Focus Recommendation*\n\n"
            f"*Task*: {task.get('content')}\n"
            f"*Priority*: {priority_label}\n"
            f"*Due*: {due}\n\n"
            f"_Query Latency: {result['duration_ms']}ms ({result['cache_status']} cache)_"
        )
    else:
        msg = "🎯 No active tasks on your Todoist! Take a break or check /news."
        
    await update.message.reply_text(msg, parse_mode="Markdown")

async def blocking_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/blocking - Returns tasks/PRs blocked or waiting on feedback"""
    await update.message.reply_chat_action("typing")
    
    # Run a composite search prompt via NL-to-SQL
    prompt = "find unread email messages containing 'PR' or 'review', and open github pull requests"
    result = gemini_service.execute_nl_query_with_self_correction(prompt)
    
    if result["success"]:
        answer = gemini_service.synthesize_answer(prompt, result["sql"], result["data"])
        msg = (
            f"🚧 *Blocking & Review items*\n\n"
            f"{answer}\n\n"
            f"_Query latency: {result['duration_ms']}ms_"
        )
    else:
        msg = f"🚧 Failed to retrieve blocking items. Error: {result['error']}"
        
    await update.message.reply_text(msg, parse_mode="Markdown")

async def next_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/next - Returns next calendar event and time remaining"""
    await update.message.reply_chat_action("typing")
    
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    sql = (
        f"SELECT summary, start_date_time FROM google_calendar.events "
        f"WHERE single_events = true AND start_date_time > '{now_str}' "
        f"ORDER BY start_date_time ASC LIMIT 1"
    )
    result = coral_client.execute_query(sql)
    
    if result["data"]:
        event = result["data"][0]
        summary = event.get("summary", "Untitled Meeting")
        start_time_str = event.get("start_date_time")
        
        try:
            # Example: 2026-05-29T16:00:00Z
            dt = datetime.strptime(start_time_str.split(".")[0].replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
            diff = dt - datetime.utcnow()
            minutes_left = int(diff.total_seconds() / 60)
            
            if minutes_left > 60:
                hours = minutes_left // 60
                mins = minutes_left % 60
                time_label = f"{hours}h {mins}m"
            else:
                time_label = f"{minutes_left} minutes"
                
            msg = (
                f"📅 *Next Calendar Event*\n\n"
                f"*Event*: {summary}\n"
                f"*Starts in*: {time_label} ({dt.strftime('%I:%M %p')})\n\n"
                f"_Query Latency: {result['duration_ms']}ms_"
            )
        except Exception as ex:
            msg = f"📅 *Next Event*: {summary} at {start_time_str}"
    else:
        msg = "📅 No upcoming events found on your primary calendar."
        
    await update.message.reply_text(msg, parse_mode="Markdown")

async def health_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/health - Returns Day Health Score with progress bar"""
    await update.message.reply_chat_action("typing")
    
    # Query details
    tasks_res = coral_client.execute_query("SELECT COUNT(*) as cnt FROM todoist.tasks WHERE checked = false AND priority = 4")
    unread_res = coral_client.execute_query("SELECT COUNT(*) as cnt FROM gmail.messages WHERE label_ids = 'UNREAD'")
    
    today_str = datetime.utcnow().strftime("%Y-%m-%dT00:00:00Z")
    tomorrow_str = (datetime.utcnow() + datetime.resolution).strftime("%Y-%m-%dT00:00:00Z")
    meetings_res = coral_client.execute_query(f"SELECT COUNT(*) as cnt FROM google_calendar.events WHERE single_events = true AND time_min = '{today_str}' AND time_max = '{tomorrow_str}'")

    tasks_count = tasks_res["data"][0]["cnt"] if tasks_res["data"] else 0
    unread_count = unread_res["data"][0]["cnt"] if unread_res["data"] else 0
    meetings_count = meetings_res["data"][0]["cnt"] if meetings_res["data"] else 0

    score = 100 - (tasks_count * 10) - (unread_count * 5) - (max(0, meetings_count - 3) * 5)
    score = max(0, min(100, score))

    # Progress bar representation
    filled_blocks = int(score / 10)
    empty_blocks = 10 - filled_blocks
    progress_bar = "█" * filled_blocks + "░" * empty_blocks

    msg = (
        f"🏥 *Day Health Score*\n\n"
        f"Score: *{score}/100*\n"
        f"`[{progress_bar}]`\n\n"
        f"• Urgent Tasks: {tasks_count}\n"
        f"• Unread Emails: {unread_count}\n"
        f"• Today's Meetings: {meetings_count}\n"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def news_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/news - Returns top 3 Hacker News/Dev.to articles"""
    await update.message.reply_chat_action("typing")
    
    sql = "SELECT title, url FROM hn.front_page LIMIT 3"
    result = coral_client.execute_query(sql)
    
    if result["data"]:
        msg_lines = ["🔥 *Stack Pulse - Hacker News Top articles:*\n"]
        for idx, item in enumerate(result["data"]):
            title = item.get("title", "No Title")
            url = item.get("url", "#")
            msg_lines.append(f"{idx+1}. [{title}]({url})")
        msg = "\n".join(msg_lines)
    else:
        msg = "🔥 No recent news items could be loaded."
        
    await update.message.reply_text(msg, parse_mode="Markdown", disable_web_page_preview=True)

async def refresh_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/refresh - Forces cache-bypassing refresh and returns updated focus card"""
    await update.message.reply_text("🔄 Bypassing cache and refreshing all sources...")
    await update.message.reply_chat_action("typing")
    
    # Query Todoist bypassing cache
    task_sql = "SELECT content, priority, due__date FROM todoist.tasks WHERE checked = false ORDER BY priority DESC, due__date ASC LIMIT 1"
    result = coral_client.execute_query(task_sql, bypass_cache=True)
    
    if result["data"]:
        task = result["data"][0]
        due = task.get("due__date", "No due date")
        msg = (
            f"🔄 *Refreshed Focus Recommendation*\n\n"
            f"*Task*: {task.get('content')}\n"
            f"*Due*: {due}\n\n"
            f"_Refresh latency: {result['duration_ms']}ms (Cache BYPASSED)_"
        )
    else:
        msg = "🎯 Refreshed successfully. No active tasks!"
        
    await update.message.reply_text(msg, parse_mode="Markdown")

async def week_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/week - Returns Weekly Rewind summary (any day)"""
    await update.message.reply_chat_action("typing")
    
    # Fetch accomplishments from previous 7 days
    last_week = (datetime.utcnow() - asyncio.subprocess.sys.modules['datetime'].timedelta(days=7)).strftime("%Y-%m-%dT00:00:00Z")
    
    owner = os.getenv("GITHUB_OWNER") or "withcoral"
    repo = os.getenv("GITHUB_REPO") or "coral"
    pr_res = coral_client.execute_query(f"SELECT number, title FROM github.pulls WHERE owner = '{owner}' AND repo = '{repo}' AND state = 'closed' LIMIT 10")
    gmail_res = coral_client.execute_query(f"SELECT count(*) as cnt FROM gmail.messages LIMIT 100")
    todoist_res = coral_client.execute_query(f"SELECT content FROM todoist.tasks WHERE checked = true LIMIT 50")
    
    stats = {
        "merged_prs_count": len(pr_res["data"]),
        "emails_received": gmail_res["data"][0]["cnt"] if (gmail_res["data"] and "cnt" in gmail_res["data"][0]) else len(gmail_res["data"]),
        "tasks_completed_count": len(todoist_res["data"]),
        "meetings": []
    }
    
    summary = gemini_service.synthesize_weekly_rewind(stats)
    msg = (
        f"📅 *On-Demand Weekly Rewind*\n\n"
        f"{summary}"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handles natural language messages using Gemini self-correction loop"""
    user_text = update.message.text
    await update.message.reply_chat_action("typing")
    
    result = gemini_service.execute_nl_query_with_self_correction(user_text)
    
    if result["success"]:
        answer = gemini_service.synthesize_answer(user_text, result["sql"], result["data"])
        msg = (
            f"{answer}\n\n"
            f"_SQL: `{result['sql']}`_\n"
            f"_Latency: {result['duration_ms']}ms_"
        )
    else:
        msg = f"Sorry, I encountered an error running that query:\n`{result['error']}`"
        
    await update.message.reply_text(msg, parse_mode="Markdown")

async def main_bot():
    if not TOKEN:
        print("[TelegramBot] Error: TELEGRAM_BOT_TOKEN not found in environment.")
        return

    # Build bot application
    app = Application.builder().token(TOKEN).build()

    # Register handlers
    app.add_handler(CommandHandler("focus", focus_command))
    app.add_handler(CommandHandler("blocking", blocking_command))
    app.add_handler(CommandHandler("next", next_command))
    app.add_handler(CommandHandler("health", health_command))
    app.add_handler(CommandHandler("news", news_command))
    app.add_handler(CommandHandler("refresh", refresh_command))
    app.add_handler(CommandHandler("week", week_command))
    
    # Message handler for NL queries
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("[TelegramBot] Starting polling loop...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    
    # Run forever in this loop
    while True:
        await asyncio.sleep(3600)

def start_bot():
    """Initializes and runs the bot loop in its own thread context."""
    if not TOKEN:
        print("[TelegramBot] Skipping startup: TELEGRAM_BOT_TOKEN is empty.")
        return
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main_bot())
    except Exception as e:
        print(f"[TelegramBot] Bot exception: {e}")
