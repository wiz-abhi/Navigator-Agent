import { useState, useEffect } from 'react';
import { Clock, Calendar, Cloud, AlertTriangle, Sparkles, X, ChevronRight, Sun, CloudRain, CloudSnow, CloudLightning, CloudFog, MapPin, ListTodo, Save, Settings, GitPullRequest, Mail, BookOpen, Maximize2, Minimize2 } from 'lucide-react';

const getTimestamp = () => Date.now();

// Demo mock data — shown when Todoist is not configured or returns empty
const MOCK_TASKS = [
  { id: 'mock-1', content: 'Review PR: Add OAuth2 refresh token rotation', priority: 4, due__date: new Date().toISOString().split('T')[0], checked: false },
  { id: 'mock-2', content: 'Fix flaky E2E test in CI pipeline', priority: 4, due__date: new Date().toISOString().split('T')[0], checked: false },
  { id: 'mock-3', content: 'Write release notes for v1.4.0', priority: 3, due__date: new Date(Date.now() + 86400000).toISOString().split('T')[0], checked: false },
  { id: 'mock-4', content: 'Migrate staging DB to new schema', priority: 3, due__date: new Date(Date.now() + 86400000).toISOString().split('T')[0], checked: false },
  { id: 'mock-5', content: 'Update dependency: coral-api to 2.1.0', priority: 2, due__date: new Date(Date.now() + 172800000).toISOString().split('T')[0], checked: false },
  { id: 'mock-6', content: 'Refactor rate-limiter middleware', priority: 2, due__date: null, checked: false },
  { id: 'mock-7', content: 'Sync upstream AGENTS.md changes to fork', priority: 1, due__date: null, checked: false },
];

// Demo mock emails — shown when Gmail is not configured or inbox is empty
const MOCK_EMAILS = [
  { id: 'memail-1', snippet: 'GitHub Actions: ✅ Build passed on main — coral-fork CI workflow completed in 2m 14s. View run details and artifacts in the Actions tab.' },
  { id: 'memail-2', snippet: 'Liam (via Notion): Hey, the API design doc is ready for review. Left a few comments on the auth section — can you take a look before EOD?' },
  { id: 'memail-3', snippet: 'Vercel: Your deployment for navigator-ui is live. Preview URL: https://navigator-ui-git-feat-dashboard.vercel.app' },
  { id: 'memail-4', snippet: 'Dependabot alert: A high severity vulnerability was found in lodash (CVE-2021-23337). Update to v4.17.21 or later to resolve.' },
  { id: 'memail-5', snippet: "Priya: Quick sync tomorrow at 11 AM works for me. I'll send a calendar invite. Also, do you have access to the staging environment?" },
];

// Demo mock calendar events — shown when Google Calendar is not configured or has no events today
const _today = new Date();
const _todayStr = _today.toISOString().split('T')[0];
const MOCK_EVENTS = [
  { id: 'mevt-1', summary: 'Daily Standup', start_date_time: `${_todayStr}T09:30:00`, end_date_time: `${_todayStr}T09:45:00` },
  { id: 'mevt-2', summary: 'Sprint Planning — Q3 Cycle 4', start_date_time: `${_todayStr}T11:00:00`, end_date_time: `${_todayStr}T12:00:00` },
  { id: 'mevt-3', summary: 'API Design Review with Liam', start_date_time: `${_todayStr}T14:00:00`, end_date_time: `${_todayStr}T14:30:00` },
  { id: 'mevt-4', summary: 'Async: coral-engine perf benchmarks', start_date_time: `${_todayStr}T15:30:00`, end_date_time: `${_todayStr}T16:00:00` },
  { id: 'mevt-5', summary: 'Team Retro', start_date_time: `${_todayStr}T17:00:00`, end_date_time: `${_todayStr}T17:45:00` },
];



export default function Dashboard({
  setHealthScore,
  lastQueryMeta,
  setLastQueryMeta,
  onNavigateToSetup,
  setIsRefreshing,
  refreshTrigger
}) {
  // Weekly Rewind Monday trigger
  const [showWeeklyRewind, setShowWeeklyRewind] = useState(false);
  const [weeklyRewindText, setWeeklyRewindText] = useState('');

  // "While You Were Away" Overlay state
  const [showAwayOverlay, setShowAwayOverlay] = useState(false);
  const [awaySummary, setAwaySummary] = useState('');

  // Expanded card state
  const [expandedCard, setExpandedCard] = useState(null);

  // Dashboard feeds data
  const [feeds, setFeeds] = useState({
    focus_task: null,
    weather: null,
    events: [],
    prs: [],
    emails: [],
    tasks: [],
    articles: []
  });

  const [loading, setLoading] = useState(true);
  const [loadingWeather, setLoadingWeather] = useState(false);

  // Weather configuration state
  const [weatherLat, setWeatherLat] = useState(() => localStorage.getItem('navigator_weather_latitude') || '');
  const [weatherLon, setWeatherLon] = useState(() => localStorage.getItem('navigator_weather_longitude') || '');
  const [weatherLocationName, setWeatherLocationName] = useState(() => localStorage.getItem('navigator_weather_location_name') || '');
  const [isEditingWeather, setIsEditingWeather] = useState(!localStorage.getItem('navigator_weather_latitude'));
  const [tempLat, setTempLat] = useState(() => localStorage.getItem('navigator_weather_latitude') || '');
  const [tempLon, setTempLon] = useState(() => localStorage.getItem('navigator_weather_longitude') || '');
  const [weatherError, setWeatherError] = useState('');



  // Source health status (inherited from backend queries)
  const sourceStatus = lastQueryMeta?.source_status || {
    github: "healthy", gmail: "healthy", google_calendar: "healthy",
    todoist: "healthy", hn: "healthy", devto: "healthy", open_meteo: "healthy"
  };

  // Check if any source is degraded
  const degradedSources = Object.entries(sourceStatus)
    .filter(([, status]) => status === 'degraded')
    .map(([source]) => source);

  const loadDashboardData = async (isBackground = false, checkAwayDiff = false) => {
    const hasData = feeds.focus_task || feeds.weather || feeds.events.length > 0 || feeds.prs.length > 0 || feeds.emails.length > 0 || feeds.tasks.length > 0 || feeds.articles.length > 0;
    if (!isBackground && !hasData) {
      setLoading(true);
    } else if (!isBackground) {
      setIsRefreshing(true);
    }
    try {
      // 1. Fetch Focus details with optional weather coordinates
      const lat = localStorage.getItem('navigator_weather_latitude');
      const lon = localStorage.getItem('navigator_weather_longitude');
      let focusUrl = 'http://localhost:8000/api/focus?bypass_cache=false';
      if (lat && lon) {
        focusUrl += `&latitude=${lat}&longitude=${lon}`;
      }
      const focusRes = await fetch(focusUrl);
      const focusData = await focusRes.json();

      // 2. Fetch Health score
      const healthRes = await fetch('http://localhost:8000/api/health');
      const healthData = await healthRes.json();



      // Check which integrations are active
      const isGithubEnabled = localStorage.getItem('navigator_enable_github') !== 'false';
      const isGmailEnabled = localStorage.getItem('navigator_enable_gmail') !== 'false';
      const isTodoistEnabled = localStorage.getItem('navigator_enable_todoist') !== 'false';

      // 4. Fetch additional list states for cards
      let githubData = { data: [] };
      if (isGithubEnabled) {
        try {
          const githubRes = await fetch('http://localhost:8000/api/github/pulls');
          if (githubRes.ok) {
            const data = await githubRes.json();
            githubData = { data };
          }
        } catch (err) {
          console.error("Failed to fetch Github pulls: ", err);
        }
      }

      let gmailData = { data: [] };
      if (isGmailEnabled) {
        try {
          const gmailRes = await fetch('http://localhost:8000/api/sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: "SELECT id, snippet FROM gmail.threads WHERE label_ids = 'INBOX' LIMIT 5",
              bypass_cache: false
            })
          });
          gmailData = await gmailRes.json();
        } catch (err) {
          console.error("Failed to fetch Gmail threads: ", err);
        }
      }

      let todoistData = { data: [] };
      if (isTodoistEnabled) {
        try {
          const todoistRes = await fetch('http://localhost:8000/api/sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: "SELECT id, content, priority, due__date, checked FROM todoist.tasks WHERE checked = false ORDER BY priority DESC, due__date ASC LIMIT 10",
              bypass_cache: false
            })
          });
          todoistData = await todoistRes.json();
        } catch (err) {
          console.error("Failed to fetch Todoist tasks: ", err);
        }
      }

      const isDevtoEnabled = localStorage.getItem('navigator_enable_devto') !== 'false';
      let devtoData = { data: [] };
      if (isDevtoEnabled) {
        try {
          const devtoRes = await fetch('http://localhost:8000/api/sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: "SELECT title, url, description, public_reactions_count, reading_time_minutes FROM devto.articles WHERE state = 'rising' LIMIT 5",
              bypass_cache: false
            })
          });
          devtoData = await devtoRes.json();
        } catch (err) {
          console.error("Failed to fetch Dev.to articles: ", err);
        }
      }

      const newDashboardState = {
        focus_task: focusData.focus_task,
        weather: focusData.weather,
        events: (focusData.events && focusData.events.length > 0) ? focusData.events : MOCK_EVENTS,
        prs: githubData.data || [],
        emails: (gmailData.data && gmailData.data.length > 0) ? gmailData.data : MOCK_EMAILS,
        tasks: (todoistData.data && todoistData.data.length > 0) ? todoistData.data : MOCK_TASKS,
        articles: devtoData.data || []
      };

      setFeeds(newDashboardState);
      setHealthScore(healthData);



      // Propagate latency meta to index metrics bar
      if (focusData.execution_metadata) {
        setLastQueryMeta({
          time_ms: focusData.execution_metadata.time_ms,
          cache_status: focusData.execution_metadata.cache_status,
          source_status: focusData.source_status
        });
      }

      // "While You Were Away" Diff Evaluation
      if (checkAwayDiff) {
        const lastLoaded = localStorage.getItem('navigator_last_loaded');
        const lastDataRaw = localStorage.getItem('navigator_last_data');
        const now = getTimestamp();

        // 90 minutes = 5400000 ms
        if (lastLoaded && lastDataRaw && (now - parseInt(lastLoaded)) > 5400000) {
          const oldData = JSON.parse(lastDataRaw);
          // Query backend to synthesize the diff
          const diffRes = await fetch('http://localhost:8000/api/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_data: oldData, new_data: newDashboardState })
          });
          if (diffRes.ok) {
            const diffData = await diffRes.json();
            setAwaySummary(diffData.summary);
            setShowAwayOverlay(true);
          }
        }
        
        // Save current baseline
        localStorage.setItem('navigator_last_loaded', now.toString());
        localStorage.setItem('navigator_last_data', JSON.stringify(newDashboardState));
      }

    } catch (e) {
      console.error('Failed to reload dashboard feeds', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchWeeklyRewind = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/rewind');
      if (response.ok) {
        const data = await response.json();
        setWeeklyRewindText(data.summary);
        setShowWeeklyRewind(true);
      }
    } catch (ex) {
      console.error('Failed to compile Weekly Rewind', ex);
    }
  };

  const dismissWeeklyRewind = () => {
    const today = new Date();
    localStorage.setItem('navigator_dismissed_rewind_date', today.toDateString());
    setShowWeeklyRewind(false);
  };





  const handleSaveWeatherLocation = async () => {
    if (!tempLat || !tempLon) {
      setWeatherError('Latitude and Longitude are required.');
      return;
    }
    const latNum = parseFloat(tempLat);
    const lonNum = parseFloat(tempLon);
    if (isNaN(latNum) || isNaN(lonNum)) {
      setWeatherError('Coordinates must be valid numbers.');
      return;
    }

    setWeatherError('');
    setLoadingWeather(true);
    try {
      setWeatherLat(tempLat);
      setWeatherLon(tempLon);
      localStorage.setItem('navigator_weather_latitude', tempLat);
      localStorage.setItem('navigator_weather_longitude', tempLon);

      // Resolve location name
      let resolvedName = '';
      const presets = [
        { name: 'New York', lat: '40.7128', lon: '-74.0060' },
        { name: 'San Francisco', lat: '37.7749', lon: '-122.4194' },
        { name: 'London', lat: '51.5074', lon: '-0.1278' },
        { name: 'Bengaluru', lat: '12.9716', lon: '77.5946' },
        { name: 'Tokyo', lat: '35.6762', lon: '139.6503' }
      ];
      const matchedPreset = presets.find(p => 
        Math.abs(parseFloat(p.lat) - latNum) < 0.01 && 
        Math.abs(parseFloat(p.lon) - lonNum) < 0.01
      );
      if (matchedPreset) {
        resolvedName = matchedPreset.name;
      } else {
        try {
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latNum}&longitude=${lonNum}&localityLanguage=en`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            resolvedName = geoData.city || geoData.locality || geoData.principalSubdivision || `${latNum.toFixed(2)}, ${lonNum.toFixed(2)}`;
          }
        } catch (err) {
          console.error('Reverse geocoding failed', err);
        }
      }

      if (!resolvedName) {
        resolvedName = `${latNum.toFixed(4)}, ${lonNum.toFixed(4)}`;
      }

      setWeatherLocationName(resolvedName);
      localStorage.setItem('navigator_weather_location_name', resolvedName);
      setIsEditingWeather(false);

      await fetch('http://localhost:8000/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather_latitude: latNum,
          weather_longitude: lonNum
        })
      });
      await loadDashboardData(false, false);
    } catch (err) {
      console.error('Failed to save weather location', err);
      setWeatherError('Failed to save location.');
    } finally {
      setLoadingWeather(false);
    }
  };

  const getWeatherDescription = (code) => {
    if (code === 0) return { text: 'Clear Sky', color: 'text-amber-400', icon: Sun };
    if (code >= 1 && code <= 3) return { text: 'Partly Cloudy', color: 'text-slate-300', icon: Cloud };
    if (code >= 45 && code <= 48) return { text: 'Foggy', color: 'text-slate-400', icon: CloudFog };
    if (code >= 51 && code <= 55) return { text: 'Drizzle', color: 'text-sky-300', icon: CloudRain };
    if (code >= 61 && code <= 65) return { text: 'Rainy', color: 'text-blue-400', icon: CloudRain };
    if (code >= 71 && code <= 75) return { text: 'Snowy', color: 'text-sky-100', icon: CloudSnow };
    if (code >= 80 && code <= 82) return { text: 'Rain Showers', color: 'text-blue-500', icon: CloudRain };
    if (code >= 85 && code <= 86) return { text: 'Snow Showers', color: 'text-sky-200', icon: CloudSnow };
    if (code === 95) return { text: 'Thunderstorm', color: 'text-purple-400', icon: CloudLightning };
    return { text: 'Unknown', color: 'text-slate-400', icon: Cloud };
  };



  // Resolve location name from saved coordinates if name is missing
  useEffect(() => {
    const resolveLocationName = async () => {
      if (weatherLat && weatherLon && !weatherLocationName) {
        const latNum = parseFloat(weatherLat);
        const lonNum = parseFloat(weatherLon);
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          const presets = [
            { name: 'New York', lat: '40.7128', lon: '-74.0060' },
            { name: 'San Francisco', lat: '37.7749', lon: '-122.4194' },
            { name: 'London', lat: '51.5074', lon: '-0.1278' },
            { name: 'Bengaluru', lat: '12.9716', lon: '77.5946' },
            { name: 'Tokyo', lat: '35.6762', lon: '139.6503' }
          ];
          const matchedPreset = presets.find(p => 
            Math.abs(parseFloat(p.lat) - latNum) < 0.01 && 
            Math.abs(parseFloat(p.lon) - lonNum) < 0.01
          );
          if (matchedPreset) {
            setWeatherLocationName(matchedPreset.name);
            localStorage.setItem('navigator_weather_location_name', matchedPreset.name);
          } else {
            try {
              const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latNum}&longitude=${lonNum}&localityLanguage=en`);
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                const name = geoData.city || geoData.locality || geoData.principalSubdivision || `${latNum.toFixed(2)}, ${lonNum.toFixed(2)}`;
                setWeatherLocationName(name);
                localStorage.setItem('navigator_weather_location_name', name);
              }
            } catch (err) {
              console.error('Failed to resolve location name', err);
            }
          }
        }
      }
    };
    resolveLocationName();
  }, [weatherLat, weatherLon, weatherLocationName]);

  // Poll intervals
  useEffect(() => {
    // Check if it's Monday morning to trigger Weekly Rewind
    const today = new Date();
    const isMonday = today.getDay() === 1;
    const dismissedRewind = localStorage.getItem('navigator_dismissed_rewind_date');
    const todayStr = today.toDateString();

    if (isMonday && dismissedRewind !== todayStr) {
      setTimeout(() => {
        fetchWeeklyRewind();
      }, 0);
    }

    // Run initial queries and check "While You Were Away" diff
    setTimeout(() => {
      loadDashboardData(false, true);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle manual refresh trigger from App header
  useEffect(() => {
    if (refreshTrigger > 0) {
      setTimeout(() => {
        loadDashboardData(false, false);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium animate-pulse">Running Coral SQL & gathering intelligence...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Degraded Health Banner */}
      {degradedSources.length > 0 && (
        <div className="w-full bg-rose-950/40 border border-rose-500/20 px-4 py-3 rounded-2xl flex items-center justify-between text-sm text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
            <span>
              <strong>Feeds Degraded:</strong> {degradedSources.join(', ')} source{degradedSources.length > 1 ? 's' : ''} unavailable. Focus recommendations may be incomplete.
            </span>
          </div>
          <button 
            onClick={onNavigateToSetup}
            className="text-xs bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg border border-rose-500/20 font-semibold transition-all shrink-0 ml-4"
          >
            Reconnect Credentials
          </button>
        </div>
      )}

      {/* Monday Weekly Rewind Card */}
      {showWeeklyRewind && (
        <div className="w-full bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-500/25 p-6 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3">
            <button onClick={dismissWeeklyRewind} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-amber-400 pulsing-glow" />
            <h4 className="font-bold text-slate-200 text-lg">Your Weekly Rewind</h4>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
            {weeklyRewindText || "Analyzing your accomplishments..."}
          </p>
        </div>
      )}

      {/* Main Grid: Context Cards */}
      <div className="grid lg:grid-cols-3 gap-6 transition-all duration-300">
        
        {/* Card 1: Open Pull Requests */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-200 text-base flex items-center gap-1.5">
                <GitPullRequest className="w-4 h-4 text-purple-400" /> Open Pull Requests
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedCard('prs')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-github" title="GitHub Feed" />
              </div>
            </div>

            <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
              {feeds.prs && feeds.prs.length > 0 ? (
                feeds.prs.map((pr) => (
                  <div key={pr.number} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <a 
                          href={pr.html_url || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-slate-200 font-medium hover:text-blue-400 transition-colors line-clamp-2"
                        >
                          {pr.repo_name && <span className="text-purple-400 font-semibold mr-1.5">{pr.repo_name}</span>}
                          #{pr.number} {pr.title}
                        </a>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <span>by {pr.user__login}</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md border font-bold bg-purple-500/10 text-purple-400 border-purple-500/20 uppercase tracking-wider">
                        {pr.state}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-xs text-slate-500 py-10">No open pull requests found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Weather Forecast & Config Card */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Local Weather</span>
              <div className="flex items-center gap-2">
                {loadingWeather && <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                <button
                  type="button"
                  onClick={() => setExpandedCard('weather')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-weather" title="Open-Meteo Feed" />
              </div>
            </div>

            {isEditingWeather ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Configure your location coordinates to fetch local weather.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Latitude</label>
                    <input
                      type="text"
                      placeholder="e.g. 40.7128"
                      value={tempLat}
                      onChange={(e) => setTempLat(e.target.value)}
                      className="w-full bg-[#161B22] border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Longitude</label>
                    <input
                      type="text"
                      placeholder="e.g. -74.0060"
                      value={tempLon}
                      onChange={(e) => setTempLon(e.target.value)}
                      className="w-full bg-[#161B22] border border-slate-850 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Preset buttons */}
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Presets</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'NY', lat: '40.7128', lon: '-74.0060' },
                      { name: 'SF', lat: '37.7749', lon: '-122.4194' },
                      { name: 'London', lat: '51.5074', lon: '-0.1278' },
                      { name: 'Bengaluru', lat: '12.9716', lon: '77.5946' },
                      { name: 'Tokyo', lat: '35.6762', lon: '139.6503' }
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setTempLat(p.lat);
                          setTempLon(p.lon);
                        }}
                        className="text-[10px] bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-lg"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {weatherError && <p className="text-xs text-rose-400">{weatherError}</p>}
                
                <button
                  type="button"
                  onClick={handleSaveWeatherLocation}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Location
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const desc = getWeatherDescription(feeds.weather?.current_weather_code ?? 0);
                    const WeatherIcon = desc.icon;
                    return (
                      <>
                        <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                          <WeatherIcon className={`w-8 h-8 ${desc.color}`} />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-slate-100">
                            {feeds.weather?.current_temperature_2m != null ? `${feeds.weather.current_temperature_2m}°C` : '--°C'}
                          </div>
                          <div className="text-xs text-slate-400 font-medium">
                            {desc.text}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 text-xs space-y-2 text-slate-400">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      Location:
                    </span>
                    <span className="text-slate-200 font-semibold">{weatherLocationName || `${parseFloat(weatherLat).toFixed(4)}, ${parseFloat(weatherLon).toFixed(4)}`}</span>
                  </div>
                  {feeds.weather?.current_wind_speed_10m != null && (
                    <div className="flex justify-between">
                      <span>Wind Speed:</span>
                      <span className="text-slate-300">{feeds.weather.current_wind_speed_10m} km/h</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTempLat(weatherLat);
                    setTempLon(weatherLon);
                    setIsEditingWeather(true);
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  Change Location
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Todoist Tasks Card */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-200 text-base flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-orange-400" /> Active Tasks
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedCard('tasks')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-todoist" title="Todoist Feed" />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
              {feeds.tasks && feeds.tasks.length > 0 ? (
                feeds.tasks.map((task) => {
                  let priorityColor = 'bg-slate-800 text-slate-400 border-slate-700';
                  let priorityLabel = 'P4';
                  if (task.priority === 4) {
                    priorityColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                    priorityLabel = 'P1';
                  } else if (task.priority === 3) {
                    priorityColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
                    priorityLabel = 'P2';
                  } else if (task.priority === 2) {
                    priorityColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                    priorityLabel = 'P3';
                  }
                  
                  return (
                    <div key={task.id} className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl hover:border-slate-750 transition-colors flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-200 font-medium break-words">{task.content}</div>
                        {task.due__date && (
                          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>Due: {task.due__date}</span>
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${priorityColor}`}>
                        {priorityLabel}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-xs text-slate-500 py-10">No active tasks found in Todoist.</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Dev.to Articles Card */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-200 text-base flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-400" /> Dev.to Articles
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedCard('articles')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-devto" title="Dev.to Feed" />
              </div>
            </div>

            <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
              {feeds.articles && feeds.articles.length > 0 ? (
                feeds.articles.map((art, idx) => (
                  <div key={idx} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                    <a 
                      href={art.url || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs text-slate-200 font-medium hover:text-emerald-400 transition-colors line-clamp-2"
                    >
                      {art.title}
                    </a>
                    {art.reading_time_minutes && (
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                        <span>{art.reading_time_minutes} min read</span>
                        {art.public_reactions_count != null && (
                          <>
                            <span>•</span>
                            <span>{art.public_reactions_count} reactions</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center text-xs text-slate-500 py-10">No trending articles found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 5: Recent Emails */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-200 text-base flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-rose-400" /> Recent Emails
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedCard('emails')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-gmail" title="Gmail API Feed" />
              </div>
            </div>

            <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
              {feeds.emails && feeds.emails.length > 0 ? (
                feeds.emails.map((email) => (
                  <div key={email.id} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                    <p className="text-xs text-slate-300 leading-normal line-clamp-2">
                      {email.snippet}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center text-xs text-slate-500 py-10">Your inbox is clear.</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 6: Today's Schedule */}
        <div className="lg:col-span-1 glass rounded-3xl pt-4 px-4 pb-2 border border-slate-800 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-200 text-base flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-400" /> Today's Schedule
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedCard('schedule')}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Expand Card"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-calendar" title="Google Calendar Feed" />
              </div>
            </div>

            <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
              {feeds.events.length > 0 ? (
                feeds.events.map((evt, idx) => {
                  let timeStr = 'All Day';
                  if (evt.start_date_time) {
                    try {
                      const dt = new Date(evt.start_date_time);
                      timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch {
                      // Ignore date parsing errors
                    }
                  }
                  
                  // Cross join with Todoist task matching meeting summary name
                  const hasMatchingTask = feeds.tasks?.some(t => t.content?.toLowerCase().includes(evt.summary?.toLowerCase()));

                  return (
                    <div key={idx} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition-colors">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">{evt.summary}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{timeStr}</div>
                        
                        <div className="flex gap-1.5 mt-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-calendar tooltip-trigger" />
                          {hasMatchingTask && (
                            <span className="w-1.5 h-1.5 rounded-full bg-todoist tooltip-trigger">
                              <div className="absolute left-0 top-full mt-1 glass p-1.5 rounded z-20 text-[10px] opacity-0 invisible tooltip-content">
                                Joined task: "{evt.summary}" matches Todoist item
                              </div>
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-xs text-slate-500 py-10">No calendar events for today.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* While You Were Away Glassmorphic Overlay Modal */}
      {showAwayOverlay && (
        <div className="fixed inset-0 bg-[#0D0F14]/85 z-[300] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="w-full max-w-lg glass rounded-3xl p-8 border border-blue-500/20 relative">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-blue-400 pulsing-glow" />
              <h4 className="font-extrabold text-slate-100 text-lg">While You Were Away</h4>
            </div>
            
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 mb-6 text-sm text-slate-300 leading-relaxed">
              {awaySummary || "Compiling what changed..."}
            </div>

            <button
              onClick={() => setShowAwayOverlay(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl active:scale-95 transition-all shadow-md shadow-blue-500/10"
            >
              Acknowledge & Continue
            </button>
          </div>
        </div>
      )}

      {/* Expanded Card Glassmorphic Modal */}
      {expandedCard && (
        <div className="fixed inset-0 bg-[#0D0F14]/90 z-[350] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="w-full max-w-2xl glass rounded-3xl p-6 border border-slate-800 relative flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                {expandedCard === 'prs' && (
                  <>
                    <GitPullRequest className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-bold text-slate-100">Open Pull Requests</h3>
                  </>
                )}
                {expandedCard === 'weather' && (
                  <>
                    <Cloud className="w-5 h-5 text-sky-400" />
                    <h3 className="text-lg font-bold text-slate-100">Local Weather Details</h3>
                  </>
                )}
                {expandedCard === 'tasks' && (
                  <>
                    <ListTodo className="w-5 h-5 text-orange-400" />
                    <h3 className="text-lg font-bold text-slate-100">Active Tasks</h3>
                  </>
                )}
                {expandedCard === 'articles' && (
                  <>
                    <BookOpen className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-bold text-slate-100">Dev.to Articles</h3>
                  </>
                )}
                {expandedCard === 'emails' && (
                  <>
                    <Mail className="w-5 h-5 text-rose-400" />
                    <h3 className="text-lg font-bold text-slate-100">Recent Emails</h3>
                  </>
                )}
                {expandedCard === 'schedule' && (
                  <>
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold text-slate-100">Today's Schedule</h3>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  expandedCard === 'prs' ? 'bg-github' :
                  expandedCard === 'weather' ? 'bg-weather' :
                  expandedCard === 'tasks' ? 'bg-todoist' :
                  expandedCard === 'articles' ? 'bg-devto' :
                  expandedCard === 'emails' ? 'bg-gmail' : 'bg-calendar'
                }`} />
                <button 
                  onClick={() => setExpandedCard(null)} 
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="Close"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin space-y-4">
              
              {/* 1. Pull Requests */}
              {expandedCard === 'prs' && (
                <div className="space-y-3">
                  {feeds.prs && feeds.prs.length > 0 ? (
                    feeds.prs.map((pr) => (
                      <div key={pr.number} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                        <div className="flex justify-between items-start gap-4">
                          <div className="min-w-0">
                            <a 
                              href={pr.html_url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-sm text-slate-200 font-medium hover:text-blue-400 transition-colors block leading-relaxed"
                            >
                              {pr.repo_name && <span className="text-purple-400 font-semibold mr-1.5">{pr.repo_name}</span>}
                              #{pr.number} {pr.title}
                            </a>
                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <span>Created by: <strong>{pr.user__login}</strong></span>
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-md border font-bold bg-purple-500/10 text-purple-400 border-purple-500/20 uppercase tracking-wider">
                            {pr.state}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-10">No open pull requests found.</div>
                  )}
                </div>
              )}

              {/* 2. Weather Details */}
              {expandedCard === 'weather' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl">
                    {(() => {
                      const desc = getWeatherDescription(feeds.weather?.current_weather_code ?? 0);
                      const WeatherIcon = desc.icon;
                      return (
                        <>
                          <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                            <WeatherIcon className={`w-12 h-12 ${desc.color}`} />
                          </div>
                          <div>
                            <div className="text-3xl font-bold text-slate-100">
                              {feeds.weather?.current_temperature_2m != null ? `${feeds.weather.current_temperature_2m}°C` : '--°C'}
                            </div>
                            <div className="text-sm text-slate-400 font-medium mt-0.5">
                              {desc.text}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-xs space-y-2 text-slate-400">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Location Info</div>
                      <div className="flex justify-between">
                        <span>Resolved Location:</span>
                        <span className="text-slate-200 font-semibold">{weatherLocationName || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Latitude:</span>
                        <span className="text-slate-300 font-mono">{parseFloat(weatherLat || 0).toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Longitude:</span>
                        <span className="text-slate-300 font-mono">{parseFloat(weatherLon || 0).toFixed(4)}</span>
                      </div>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-xs space-y-2 text-slate-400">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Wind Metrics</div>
                      <div className="flex justify-between">
                        <span>Wind Speed (10m):</span>
                        <span className="text-slate-200 font-semibold">{feeds.weather?.current_wind_speed_10m != null ? `${feeds.weather.current_wind_speed_10m} km/h` : '--'}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 italic text-center">
                    Weather data is retrieved directly from the Open-Meteo API using your specified coordinate settings.
                  </p>
                </div>
              )}

              {/* 3. Todoist Tasks */}
              {expandedCard === 'tasks' && (
                <div className="space-y-3">
                  {feeds.tasks && feeds.tasks.length > 0 ? (
                    feeds.tasks.map((task) => {
                      let priorityColor = 'bg-slate-800 text-slate-400 border-slate-700';
                      let priorityLabel = 'P4';
                      if (task.priority === 4) {
                        priorityColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                        priorityLabel = 'P1';
                      } else if (task.priority === 3) {
                        priorityColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
                        priorityLabel = 'P2';
                      } else if (task.priority === 2) {
                        priorityColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                        priorityLabel = 'P3';
                      }
                      
                      return (
                        <div key={task.id} className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl hover:border-slate-750 transition-colors flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm text-slate-200 font-medium leading-relaxed">{task.content}</div>
                            {task.due__date && (
                              <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                <span>Due Date: <strong>{task.due__date}</strong></span>
                              </div>
                            )}
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold shrink-0 ${priorityColor}`}>
                            {priorityLabel}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-10">No active tasks found.</div>
                  )}
                </div>
              )}

              {/* 4. Dev.to Articles */}
              {expandedCard === 'articles' && (
                <div className="space-y-4">
                  {feeds.articles && feeds.articles.length > 0 ? (
                    feeds.articles.map((art, idx) => (
                      <div key={idx} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors space-y-2">
                        <a 
                          href={art.url || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm text-slate-200 font-semibold hover:text-emerald-400 transition-colors block"
                        >
                          {art.title}
                        </a>
                        {art.description && (
                          <p className="text-xs text-slate-400 leading-relaxed font-medium">
                            {art.description}
                          </p>
                        )}
                        {art.reading_time_minutes && (
                          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2 font-bold">
                            <span className="bg-slate-900 px-2 py-1 rounded border border-slate-800 text-slate-400">{art.reading_time_minutes} min read</span>
                            {art.public_reactions_count != null && (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/10">{art.public_reactions_count} reactions</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-10">No trending articles found.</div>
                  )}
                </div>
              )}

              {/* 5. Recent Emails */}
              {expandedCard === 'emails' && (
                <div className="space-y-3">
                  {feeds.emails && feeds.emails.length > 0 ? (
                    feeds.emails.map((email) => (
                      <div key={email.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors flex items-start gap-3">
                        <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/10 text-rose-400 mt-0.5">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 leading-relaxed">
                            {email.snippet}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-10">Your inbox is clear.</div>
                  )}
                </div>
              )}

              {/* 6. Today's Schedule */}
              {expandedCard === 'schedule' && (
                <div className="space-y-3">
                  {feeds.events.length > 0 ? (
                    feeds.events.map((evt, idx) => {
                      let timeStr = 'All Day';
                      if (evt.start_date_time) {
                        try {
                          const dt = new Date(evt.start_date_time);
                          timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        } catch {
                          // Ignore date parsing errors
                        }
                      }
                      
                      const hasMatchingTask = feeds.tasks?.some(t => t.content?.toLowerCase().includes(evt.summary?.toLowerCase()));

                      return (
                        <div key={idx} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition-colors">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-200">{evt.summary}</div>
                            <div className="text-xs text-slate-400">{timeStr}</div>
                            
                            <div className="flex gap-1.5 mt-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-calendar" />
                              {hasMatchingTask && (
                                <span className="w-1.5 h-1.5 rounded-full bg-todoist tooltip-trigger">
                                  <div className="absolute left-0 top-full mt-1 glass p-1.5 rounded z-20 text-[10px] opacity-0 invisible tooltip-content">
                                    Joined task: "{evt.summary}" matches Todoist item
                                  </div>
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-10">No calendar events for today.</div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
