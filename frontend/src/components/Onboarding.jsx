import { useState } from 'react';
import { Key, Mail, Settings, ArrowRight, CheckCircle2, AlertCircle, HelpCircle, Compass } from 'lucide-react';

const Github = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);


export default function Onboarding({ onSetupComplete, initialConfig }) {
  const [config, setConfig] = useState({
    github_token: initialConfig?.github_token || '',
    github_owner: initialConfig?.github_owner || 'withcoral',
    github_repo: initialConfig?.github_repo || 'coral',
    todoist_token: initialConfig?.todoist_token || '',
    google_client_id: initialConfig?.google_client_id || '',
    google_client_secret: initialConfig?.google_client_secret || '',
    google_refresh_token: initialConfig?.google_refresh_token || '',
    enable_github: initialConfig?.enable_github ?? true,
    enable_todoist: initialConfig?.enable_todoist ?? true,
    enable_gmail: initialConfig?.enable_gmail ?? true,
    enable_google_calendar: initialConfig?.enable_google_calendar ?? true,
    enable_open_meteo: initialConfig?.enable_open_meteo ?? true,
    enable_hn: initialConfig?.enable_hn ?? true,
    enable_devto: initialConfig?.enable_devto ?? true,
  });

  const [geminiKey, setGeminiKey] = useState(initialConfig?.gemini_key || '');
  const [telegramToken, setTelegramToken] = useState(initialConfig?.telegram_token || '');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message: '' }
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);

  const handleInputChange = (field, val) => {
    setConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus(null);

    if (!geminiKey) {
      setStatus({ type: 'error', message: 'Gemini API Key is required for core dashboard features!' });
      setIsLoading(false);
      return;
    }

    try {
      // First save standard keys & backend inputs
      const response = await fetch('http://localhost:8000/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github_token: config.github_token,
          github_owner: config.github_owner,
          github_repo: config.github_repo,
          todoist_token: config.todoist_token,
          google_client_id: config.google_client_id,
          google_client_secret: config.google_client_secret,
          google_refresh_token: config.google_refresh_token,
          enable_github: config.enable_github,
          enable_todoist: config.enable_todoist,
          enable_gmail: config.enable_gmail,
          enable_google_calendar: config.enable_google_calendar,
          enable_open_meteo: config.enable_open_meteo,
          enable_hn: config.enable_hn,
          enable_devto: config.enable_devto,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Also save local state config
        localStorage.setItem('navigator_gemini_key', geminiKey);
        localStorage.setItem('navigator_telegram_token', telegramToken);
        localStorage.setItem('navigator_onboarded', 'true');
        localStorage.setItem('navigator_github_owner', config.github_owner);
        localStorage.setItem('navigator_github_repo', config.github_repo);
        localStorage.setItem('navigator_enable_github', config.enable_github);
        localStorage.setItem('navigator_enable_todoist', config.enable_todoist);
        localStorage.setItem('navigator_enable_gmail', config.enable_gmail);
        localStorage.setItem('navigator_enable_google_calendar', config.enable_google_calendar);
        localStorage.setItem('navigator_enable_open_meteo', config.enable_open_meteo);
        localStorage.setItem('navigator_enable_hn', config.enable_hn);
        localStorage.setItem('navigator_enable_devto', config.enable_devto);
        
        setStatus({ type: 'success', message: 'Configuration saved successfully! Connecting services...' });
        setTimeout(() => {
          onSetupComplete();
        }, 1500);
      } else {
        setStatus({ type: 'error', message: data.detail || 'Failed to update credentials.' });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Could not connect to FastAPI backend on port 8000.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-2">
      <div className="w-full max-w-3xl glass rounded-3xl p-6 md:p-8 relative z-10">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-2 pulsing-glow">
            <Settings className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Navigator Integration Setup
          </h1>
          <p className="text-slate-400 text-xs mt-1 max-w-md">
            Connect your APIs to build the unified developer intelligence network.
          </p>
        </div>

        {status && (
          <div className={`mb-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            status.type === 'success' 
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-950/20 border-rose-500/30 text-rose-400'
          }`}>
            {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Section 1: Core System Keys */}
          <div>
            <h2 className="text-sm font-bold text-slate-200 border-b border-slate-800/60 pb-1 mb-2.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-400" /> Core Services
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Gemini API Key *</span>
                  <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Get Key</a>
                </label>
                <input
                  type="password"
                  required
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Telegram Bot Token</span>
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Create Bot</a>
                </label>
                <input
                  type="password"
                  placeholder="5900000000:AAFd..."
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Developer Feeds */}
          <div>
            <h2 className="text-sm font-bold text-slate-200 border-b border-slate-800/60 pb-1 mb-2.5 flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5 text-purple-400" /> Developer Integrations
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>GitHub Token</span>
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Create Token</a>
                </label>
                <input
                  type="password"
                  placeholder="ghp_..."
                  value={config.github_token}
                  onChange={(e) => handleInputChange('github_token', e.target.value)}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Todoist Token</span>
                  <a href="https://todoist.com/app/settings/integrations/developer" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Get Token</a>
                </label>
                <input
                  type="password"
                  placeholder="API Token..."
                  value={config.todoist_token}
                  onChange={(e) => handleInputChange('todoist_token', e.target.value)}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  GitHub Username / Owner
                </label>
                <input
                  type="text"
                  placeholder="withcoral"
                  value={config.github_owner}
                  onChange={(e) => handleInputChange('github_owner', e.target.value)}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Google Workspace (OAuth Refresh Setup) */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1 mb-2.5">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-rose-400" /> Google Workspace (Gmail & Calendar)
              </h2>
              <button
                type="button"
                onClick={() => setShowGoogleGuide(!showGoogleGuide)}
                className="text-xs text-blue-400 flex items-center gap-1 hover:underline"
              >
                <HelpCircle className="w-3.5 h-3.5" /> Setup Guide
              </button>
            </div>

            {showGoogleGuide && (
              <div className="mb-4 p-4 bg-[#161B22]/50 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-2 leading-relaxed">
                <p className="font-semibold text-slate-300">How to get Google Refresh Tokens:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-400 underline">Google Cloud Console</a>, create a project, and enable the **Gmail API** and **Google Calendar API**.</li>
                  <li>Configure an **OAuth consent screen** (External). Add scopes: <code className="bg-[#10141A] text-rose-400 px-1 py-0.5 rounded">.../auth/gmail.readonly</code> and <code className="bg-[#10141A] text-blue-400 px-1 py-0.5 rounded">.../auth/calendar.readonly</code>. Add your email as a test user.</li>
                  <li>Go to **Credentials** &gt; **Create Credentials** &gt; **OAuth Client ID**. Select **Web Application**. Add <code className="bg-[#10141A] text-slate-300 px-1 py-0.5">https://developers.google.com/oauthplayground</code> to the **Authorized Redirect URIs**.</li>
                  <li>Open the <a href="https://developers.google.com/oauthplayground" target="_blank" className="text-blue-400 underline">Google OAuth Playground</a>:
                    <ul className="list-disc list-inside ml-4 mt-0.5 space-y-0.5">
                      <li>Click the Settings Cog (top right), check "Use your own OAuth credentials", and input your Client ID and Client Secret.</li>
                      <li>In the scope list, select or enter both Gmail readonly and Calendar readonly scopes, then click **Authorize APIs**.</li>
                      <li>Authorize in the prompt, exchange the code in Step 2, and copy the **Refresh Token**.</li>
                    </ul>
                  </li>
                </ol>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">OAuth Client ID</label>
                  <input
                    type="password"
                    placeholder="ClientID..."
                    value={config.google_client_id}
                    onChange={(e) => handleInputChange('google_client_id', e.target.value)}
                    className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">OAuth Client Secret</label>
                  <input
                    type="password"
                    placeholder="ClientSecret..."
                    value={config.google_client_secret}
                    onChange={(e) => handleInputChange('google_client_secret', e.target.value)}
                    className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">OAuth Refresh Token</label>
                  <input
                    type="password"
                    placeholder="RefreshToken..."
                    value={config.google_refresh_token}
                    onChange={(e) => handleInputChange('google_refresh_token', e.target.value)}
                    className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Source Enable/Disable Controls */}
          <div>
            <h2 className="text-sm font-bold text-slate-200 border-b border-slate-800/60 pb-1 mb-2 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" /> Active Integrations
            </h2>
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mt-1">
              {[
                { name: 'GitHub', field: 'enable_github' },
                { name: 'Todoist', field: 'enable_todoist' },
                { name: 'Gmail', field: 'enable_gmail' },
                { name: 'Calendar', field: 'enable_google_calendar' },
                { name: 'Weather', field: 'enable_open_meteo' },
                { name: 'HN', field: 'enable_hn' },
                { name: 'Dev.to', field: 'enable_devto' }
              ].map((src) => (
                <label 
                  key={src.field} 
                  className="flex items-center justify-between px-2 py-1.5 bg-[#161B22] border border-slate-855 rounded-xl cursor-pointer hover:border-slate-700 transition-colors text-[10px] font-semibold text-slate-300"
                >
                  <span>{src.name}</span>
                  <input
                    type="checkbox"
                    checked={config[src.field]}
                    onChange={(e) => handleInputChange(src.field, e.target.checked)}
                    className="rounded bg-slate-900 border-slate-800 text-blue-500 focus:ring-blue-500 w-3 h-3 ml-1"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/10 active:scale-95 transition-all text-xs disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? 'Saving...' : 'Launch Dashboard'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
