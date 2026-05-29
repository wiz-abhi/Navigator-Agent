import { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Sparkles, Copy, Check } from 'lucide-react';

// Pre-canned demo responses — fire instantly without hitting the backend
// Trigger: exact match on query text (case-insensitive)
const DEMO_CANNED = {
  "what should i work on today?": {
    answer: `Based on your current task list and calendar, here's your recommended focus for today:

🔴 **Top Priority:** Fix the flaky E2E test in the CI pipeline (P1, due today) — blocking the main branch merge.

🟠 **Urgent PR:** Address changes requested by the maintainer on the coral repo — PR #41 has review comments that need resolving before it can merge.

🟠 **Next Up:** Review PR #42 — the OAuth2 refresh token rotation PR has been open for 2 days and needs your sign-off.

📅 **Heads up:** You have Sprint Planning at 11:00 AM and a design review with Liam at 2:00 PM — block your morning for deep work before standup.

You have **5 open PRs** across your repos. Prioritise the coral repo PR with change requests first since it's blocking upstream.`,
    sql: `SELECT t.content, t.priority, t.due__date, e.summary, e.start_date_time
FROM todoist.tasks t
LEFT JOIN google_calendar.events e
  ON DATE(e.start_date_time) = CURRENT_DATE
WHERE t.checked = false
  AND e.single_events = true
ORDER BY t.priority DESC, t.due__date ASC
LIMIT 10`,
    latency: 312,
    cacheStatus: "MISS"
  },
  "do i have any urgent tasks due soon?": {
    answer: `Yes — you have **2 urgent (P1) tasks** due today:

1. **Review PR: Add OAuth2 refresh token rotation** — due today, flagged P1
2. **Fix flaky E2E test in CI pipeline** — due today, flagged P1

You also have 2 P2 tasks due tomorrow:
- Write release notes for v1.4.0
- Migrate staging DB to new schema

Total open tasks: **7**. Recommend clearing both P1 items before your 11 AM sprint planning.`,
    sql: `SELECT id, content, priority, due__date
FROM todoist.tasks
WHERE checked = false
  AND priority >= 3
  AND (due__date IS NULL OR due__date <= DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY))
ORDER BY priority DESC, due__date ASC
LIMIT 10`,
    latency: 198,
    cacheStatus: "HIT"
  },
  "what meetings do i have today?": {
    answer: `You have **5 meetings** on your calendar today:

⏰ **9:30 AM** — Daily Standup *(15 min)*
⏰ **11:00 AM** — Sprint Planning — Q3 Cycle 4 *(1 hr)*
⏰ **2:00 PM** — API Design Review with Liam *(30 min)*
⏰ **3:30 PM** — Async: coral-engine perf benchmarks *(30 min)*
⏰ **5:00 PM** — Team Retro *(45 min)*

Your heaviest block is mid-morning. Best deep-work windows: **7–9 AM** and **12–1:30 PM**.`,
    sql: `SELECT summary, start_date_time, end_date_time
FROM google_calendar.events
WHERE single_events = true
  AND time_min = '2026-05-29T00:00:00Z'
  AND time_max = '2026-05-30T00:00:00Z'
ORDER BY start_date_time ASC`,
    latency: 145,
    cacheStatus: "HIT"
  },
  "any unread emails from my team?": {
    answer: `Yes — **3 emails** in your inbox likely from teammates:

📧 **Liam (via Notion):** API design doc is ready for review — left comments on the auth section, asking for feedback before EOD.

📧 **Priya:** Confirmed the sync tomorrow at 11 AM and asked if you have staging environment access.

📧 **Dependabot alert:** High severity vulnerability in \`lodash\` (CVE-2021-23337) — update to v4.17.21 recommended.

The GitHub Actions and Vercel notifications are automated. Nothing urgent beyond Liam's review request.`,
    sql: `SELECT id, snippet
FROM gmail.threads
WHERE label_ids = 'INBOX'
LIMIT 10`,
    latency: 267,
    cacheStatus: "MISS"
  },
  "summarize my open pull requests": {
    answer: `You have **5 open pull requests** across your repos:

🔴 **withcoral/coral** — PR #41: *Add XKCD source connector*
   → Changes requested by maintainer — needs fixes before merge

🟣 **coral-fork/coral** — PR #42: *Add OAuth2 refresh token rotation*
   → Waiting on review · Open 2 days

🟣 **coral-fork/coral** — PR #38: *Fix rate-limiter middleware edge case*
   → CI passing · Ready to merge

🟣 **coral-fork/navigator** — PR #7: *Add Dev.to articles card to dashboard*
   → Draft · Work in progress

🟣 **coral-fork/navigator** — PR #5: *Onboarding flow redesign*
   → Open · Review requested

PR #41 on the coral repo is the most urgent — the maintainer has left change requests that are blocking the merge. Address those first.`,
    sql: `SELECT number, title, state, user__login, html_url
FROM github.pulls
WHERE is_open = true
  AND author = '@me'
ORDER BY created_at DESC
LIMIT 5`,
    latency: 421,
    cacheStatus: "MISS"
  },
  "what's the weather like right now?": {
    answer: `Current conditions for **Bengaluru**:

🌤️ **28°C** — Partly Cloudy
💨 Wind: 14 km/h

Good conditions for the day — no rain expected. Comfortable for commuting or an outdoor lunch break.`,
    sql: `SELECT current_temperature_2m, current_wind_speed_10m, current_weather_code
FROM open_meteo.forecast
WHERE latitude = 12.9716
  AND longitude = 77.5946
  AND current = 'temperature_2m,wind_speed_10m,weather_code'
LIMIT 1`,
    latency: 88,
    cacheStatus: "HIT"
  },
  "show me trending articles from dev.to": {
    answer: `Here are the top rising articles on Dev.to right now:

📖 **"Building a Type-Safe API Layer with Zod and tRPC"** — 12 min read · 847 reactions

📖 **"Rust in 2026: What's Changed and What Hasn't"** — 8 min read · 621 reactions

📖 **"Stop Using .env Files — Here's What to Do Instead"** — 6 min read · 589 reactions

📖 **"Real-time Postgres Change Streams with Supabase"** — 9 min read · 412 reactions

📖 **"Benchmarking LLM Inference: vLLM vs TGI vs Ollama"** — 15 min read · 374 reactions`,
    sql: `SELECT title, url, public_reactions_count, reading_time_minutes
FROM devto.articles
WHERE state = 'rising'
ORDER BY public_reactions_count DESC
LIMIT 5`,
    latency: 176,
    cacheStatus: "HIT"
  },
  "plan my afternoon based on my calendar": {
    answer: `Here's your recommended afternoon plan:

**12:00–1:30 PM — Deep Work Block** 🎯
Your calendar is clear. Ideal time to tackle the P1 CI fix or address the coral PR review comments without interruptions.

**2:00–2:30 PM — API Design Review with Liam** 📋
Come prepared: Liam flagged comments on the auth section in the Notion doc. Skim it before joining.

**3:30–4:00 PM — coral-engine Perf Benchmarks** ⚙️
Asynchronous block — likely a self-working session. Have benchmark results ready.

**4:00–5:00 PM — Buffer / Wrap-up** 📬
Good time to reply to Priya's email and check staging environment access before EOD.

**5:00–5:45 PM — Team Retro** 🔄
End-of-sprint. Come prepared with your wins and blockers from the week.`,
    sql: `SELECT summary, start_date_time, end_date_time
FROM google_calendar.events
WHERE single_events = true
  AND time_min = '2026-05-29T12:00:00Z'
  AND time_max = '2026-05-30T00:00:00Z'
ORDER BY start_date_time ASC`,
    latency: 334,
    cacheStatus: "MISS"
  }
};

// Lightweight markdown → JSX renderer
// Handles: **bold**, `code`, bullet lists (- / numbered), blank-line paragraphs
function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let key = 0;

  const renderInline = (str) => {
    // Split on **bold** and `code` spans
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="px-1 py-0.5 bg-slate-800 rounded text-[11px] text-rose-300 font-mono">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line → spacer
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Bullet list item: starts with "- " or "• "
    if (/^[-•]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i])) {
        listItems.push(
          <li key={i} className="flex gap-2 items-start">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
            <span>{renderInline(lines[i].replace(/^[-•]\s/, ''))}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={key++} className="space-y-1 pl-1">{listItems}</ul>);
      continue;
    }

    // Numbered list: starts with "1. " "2. " etc.
    if (/^\d+\.\s/.test(line)) {
      const listItems = [];
      let num = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(
          <li key={i} className="flex gap-2 items-start">
            <span className="text-slate-500 shrink-0 text-xs mt-0.5 w-4 text-right">{num}.</span>
            <span>{renderInline(lines[i].replace(/^\d+\.\s/, ''))}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(<ol key={key++} className="space-y-1 pl-1">{listItems}</ol>);
      continue;
    }

    // Regular line
    elements.push(
      <p key={key++} className="leading-relaxed">{renderInline(line)}</p>
    );
    i++;
  }

  return <div className="space-y-1 text-sm">{elements}</div>;
}

export default function NLQuery({ onQueryExecuted }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'system',
      text: "Hi! I'm Navigator — your cross-source developer intelligence assistant. Ask me anything across your GitHub, Gmail, Calendar, Todoist, or news feeds."
    }
  ]);
  const [copiedSql, setCopiedSql] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userText = query;
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setQuery('');
    setLoading(true);

    // Check for canned demo response first
    const cannedKey = userText.trim().toLowerCase();
    const canned = DEMO_CANNED[cannedKey];

    if (canned) {
      await new Promise(r => setTimeout(r, 2500 + Math.random() * 1000));
      setMessages(prev => [...prev, {
        sender: 'navigator',
        text: canned.answer,
        sql: canned.sql,
        latency: canned.latency,
        cacheStatus: canned.cacheStatus
      }]);
      if (onQueryExecuted) {
        onQueryExecuted({ time_ms: canned.latency, cache_status: canned.cacheStatus, source_status: {} });
      }
      setLoading(false);
      return;
    }

    // Fall through to live backend
    try {
      const response = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userText }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessages(prev => [...prev, {
          sender: 'navigator',
          text: data.answer,
          sql: data.sql,
          latency: data.duration_ms,
          cacheStatus: data.cache_status
        }]);
        if (onQueryExecuted) {
          onQueryExecuted({
            time_ms: data.duration_ms,
            cache_status: data.cache_status,
            source_status: data.source_status
          });
        }
      } else {
        setMessages(prev => [...prev, {
          sender: 'error',
          text: data.detail || 'Query execution failed.'
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        sender: 'error',
        text: 'Failed to contact backend API. Make sure the FastAPI server is running on port 8000.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (sqlText, idx) => {
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(idx);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  return (
    <div className="w-full glass rounded-3xl border border-slate-800 flex flex-col" style={{ height: '600px' }}>
      {/* Header — fixed */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-400 pulsing-glow" />
          <h3 className="text-base font-bold text-slate-200">Cross-Source Assistant</h3>
        </div>
        <div className="text-slate-400 text-xs flex items-center gap-1.5 bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <Terminal className="w-3 h-3 text-blue-400" />
          <span>NL → SQL</span>
        </div>
      </div>

      {/* Messages Area — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-4 px-4 py-4 scrollbar-thin min-h-0">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${
              msg.sender === 'user'
                ? 'bg-blue-600 text-white text-sm rounded-br-none'
                : msg.sender === 'error'
                ? 'bg-rose-950/30 border border-rose-500/20 text-rose-400 text-sm'
                : 'bg-[#161B22]/80 text-slate-300 border border-slate-800 rounded-bl-none'
            }`}>
              {msg.sender === 'navigator'
                ? renderMarkdown(msg.text)
                : <span className="text-sm leading-relaxed">{msg.text}</span>
              }
            </div>

            {/* SQL compiler trace block */}
            {msg.sql && (
              <div className="w-full max-w-[88%] mt-2 bg-[#090D11] border border-slate-800 rounded-xl p-3 text-xs text-slate-400 font-mono">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-purple-400" /> compiled SQL ({msg.latency}ms · {msg.cacheStatus})
                  </span>
                  <button
                    onClick={() => copyToClipboard(msg.sql, idx)}
                    className="hover:text-slate-200 transition-colors"
                  >
                    {copiedSql === idx ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre-wrap select-all">
                  {msg.sql}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs bg-[#161B22]/30 px-3 py-2 rounded-xl border border-slate-800/50 w-fit">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
            <span>Querying sources & compiling SQL...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form — fixed at bottom */}
      <div className="px-4 pb-3 pt-2 shrink-0 border-t border-slate-800/60">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything across Gmail, Calendar, GitHub, weather..."
            className="flex-1 bg-[#161B22] border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl active:scale-95 transition-all shadow-md shadow-blue-500/10"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
