import { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import MetricsBar from './components/MetricsBar';
import NLQuery from './components/NLQuery';
import { Compass, Settings, MessageSquare, LayoutDashboard, RotateCw } from 'lucide-react';

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(() => {
    return localStorage.getItem('navigator_onboarded') === 'true';
  });
  const [currentView, setCurrentView] = useState(() => {
    return localStorage.getItem('navigator_onboarded') === 'true' ? 'dashboard' : 'setup';
  });
  const [showAssistant, setShowAssistant] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Shared status metrics
  const [healthScore, setHealthScore] = useState({
    score: 100,
    metrics: { urgent_tasks: 0, unread_emails: 0, meetings_count: 0 }
  });
  
  const [lastQueryMeta, setLastQueryMeta] = useState({
    time_ms: 10,
    cache_status: 'HIT',
    source_status: {
      github: "healthy", gmail: "healthy", google_calendar: "healthy",
      todoist: "healthy", hn: "healthy", devto: "healthy", open_meteo: "healthy"
    }
  });

  // Reset scroll to top on tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentView]);


  const handleSetupComplete = () => {
    setIsOnboarded(true);
    setCurrentView('dashboard');
  };

  const handleNavigateToSetup = () => {
    setCurrentView('setup');
  };

  const handleQueryExecuted = (meta) => {
    setLastQueryMeta(prev => ({
      ...prev,
      time_ms: meta.time_ms,
      cache_status: meta.cache_status,
      source_status: meta.source_status || prev.source_status
    }));
  };

  // Read config values to populate onboarding fields
  const getInitialConfig = () => {
    return {
      gemini_key: localStorage.getItem('navigator_gemini_key') || '',
      telegram_token: localStorage.getItem('navigator_telegram_token') || '',
      github_token: '', // Don't retrieve secret values in plaintext from browser localStorage for security
      github_owner: localStorage.getItem('navigator_github_owner') || 'withcoral',
      github_repo: localStorage.getItem('navigator_github_repo') || 'coral',
      todoist_token: '',
      google_client_id: '',
      google_client_secret: '',
      google_refresh_token: '',
      // Toggles
      enable_github: localStorage.getItem('navigator_enable_github') !== 'false',
      enable_todoist: localStorage.getItem('navigator_enable_todoist') !== 'false',
      enable_gmail: localStorage.getItem('navigator_enable_gmail') !== 'false',
      enable_google_calendar: localStorage.getItem('navigator_enable_google_calendar') !== 'false',
      enable_open_meteo: localStorage.getItem('navigator_enable_open_meteo') !== 'false',
      enable_hn: localStorage.getItem('navigator_enable_hn') !== 'false',
      enable_devto: localStorage.getItem('navigator_enable_devto') !== 'false',
    };
  };

  return (
    <div className="min-h-screen bg-[#0D0F14] text-slate-100 flex flex-col justify-between relative">
      {/* Background radial gradients */}
      <div className="absolute top-[-25%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-950/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-950/10 blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="w-full glass border-b border-slate-800/80 sticky top-0 z-[100] backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 pulsing-glow">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-slate-100 tracking-tight text-lg">NAVIGATOR</span>
              <span className="text-[10px] ml-2 font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Beta</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOnboarded && (
              <>
                {currentView === 'dashboard' && (
                  <button
                    onClick={() => setRefreshTrigger(prev => prev + 1)}
                    disabled={isRefreshing}
                    className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 text-slate-300 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all text-xs font-semibold"
                    title="Refresh Dashboard Data"
                  >
                    <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                )}

                <button
                  onClick={() => setCurrentView(currentView === 'dashboard' ? 'setup' : 'dashboard')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-xs font-semibold ${
                    currentView === 'setup' 
                      ? 'bg-blue-600/10 border-blue-500/35 text-blue-400' 
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Setup Settings</span>
                </button>

                <button
                  onClick={() => setShowAssistant(!showAssistant)}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-xs font-semibold ${
                    showAssistant 
                      ? 'bg-indigo-600/10 border-indigo-500/35 text-indigo-400' 
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Assistant {showAssistant ? 'ON' : 'OFF'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 pt-6 pb-4 flex flex-col">
        {currentView === 'setup' ? (
          <div className="flex-1">
            <Onboarding 
              onSetupComplete={handleSetupComplete} 
              initialConfig={getInitialConfig()} 
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Header Row for Content */}
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold text-slate-200">Developer Control Panel</h2>
            </div>

            {/* Columns Grid */}
            <div className="flex flex-col md:flex-row gap-6 items-stretch">
              {/* Dashboard Left Area */}
              <div className="flex-1 transition-all duration-300">
                <Dashboard 
                  healthScore={healthScore}
                  setHealthScore={setHealthScore}
                  lastQueryMeta={lastQueryMeta}
                  setLastQueryMeta={setLastQueryMeta}
                  onNavigateToSetup={handleNavigateToSetup}
                  isRefreshing={isRefreshing}
                  setIsRefreshing={setIsRefreshing}
                  refreshTrigger={refreshTrigger}
                />
              </div>

              {/* Assistant Right Panel */}
              {showAssistant && (
                <div className="w-full md:w-[380px] shrink-0 transition-all duration-300 flex flex-col">
                  <NLQuery onQueryExecuted={handleQueryExecuted} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Metrics Bar */}
      {isOnboarded && currentView === 'dashboard' && (
        <footer className="w-full max-w-7xl mx-auto px-6 pb-4 mt-6">
          <MetricsBar 
            healthScore={healthScore} 
            lastQueryMeta={lastQueryMeta} 
            sourceStatus={lastQueryMeta.source_status}
          />
        </footer>
      )}
    </div>
  );
}
