'use client';

import { useState } from 'react';
import { Save, Plus, X } from 'lucide-react';
import { DEFAULT_WATCHLIST } from '@/lib/constants';

export default function SettingsPage() {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [newTicker, setNewTicker] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [startingBalance, setStartingBalance] = useState('100000');
  const [saved, setSaved] = useState(false);

  const addTicker = () => {
    const t = newTicker.toUpperCase().trim();
    if (t && !watchlist.includes(t)) {
      setWatchlist(prev => [...prev, t]);
      setNewTicker('');
    }
  };

  const removeTicker = (t: string) => setWatchlist(prev => prev.filter(x => x !== t));

  const handleSave = () => {
    // In production, persist to Supabase user settings
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 grid-bg min-h-full max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>Settings</h1>
        <p className="text-white/40 text-sm font-mono mt-0.5">Configure your AlphaBot trading simulation</p>
      </div>

      {/* Portfolio Settings */}
      <div className="bg-[#111111] border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase">Portfolio Configuration</h2>

        <div>
          <label className="text-white/60 text-sm font-mono block mb-2">Starting Portfolio Value ($)</label>
          <input
            type="number"
            value={startingBalance}
            onChange={e => setStartingBalance(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#AAFF00]/40 transition-colors"
          />
          <p className="text-white/20 text-xs font-mono mt-1">Note: Changing this only affects new portfolios</p>
        </div>

        <div>
          <label className="text-white/60 text-sm font-mono block mb-2">Risk Tolerance</label>
          <div className="flex gap-3">
            {(['conservative', 'moderate', 'aggressive'] as const).map(level => (
              <button
                key={level}
                onClick={() => setRiskTolerance(level)}
                className={`px-4 py-2 rounded-md text-sm font-mono font-medium transition-all capitalize ${
                  riskTolerance === level
                    ? 'bg-[#AAFF00]/20 border border-[#AAFF00]/40 text-[#AAFF00]'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="mt-2 text-white/20 text-xs font-mono">
            {riskTolerance === 'conservative' && 'Max 10% position size, prefer dividend stocks and ETFs'}
            {riskTolerance === 'moderate' && 'Max 20% position size, balanced growth and stability'}
            {riskTolerance === 'aggressive' && 'Max 25% position size, growth and momentum focus'}
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="bg-[#111111] border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase">Watchlist ({watchlist.length} symbols)</h2>

        <div className="flex gap-3">
          <input
            type="text"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="Add ticker (e.g. AAPL)"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#AAFF00]/40 placeholder-white/20 transition-colors"
          />
          <button
            onClick={addTicker}
            className="px-4 py-2.5 bg-[#AAFF00]/20 border border-[#AAFF00]/30 text-[#AAFF00] rounded-lg hover:bg-[#AAFF00]/30 transition-all"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {watchlist.map(t => (
            <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-md">
              <span className="text-white font-mono text-xs font-bold">{t}</span>
              <button
                onClick={() => removeTicker(t)}
                className="text-white/20 hover:text-red-400 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys Info */}
      <div className="bg-[#111111] border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase">API Configuration</h2>
        <p className="text-white/40 text-sm">Configure API keys in your <code className="text-[#AAFF00] font-mono text-xs">.env.local</code> file:</p>
        <div className="space-y-2">
          {[
            { key: 'NEXT_PUBLIC_SUPABASE_URL', desc: 'Your Supabase project URL' },
            { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desc: 'Supabase anonymous key' },
            { key: 'SUPABASE_SERVICE_ROLE_KEY', desc: 'Supabase service role key (server-side only)' },
            { key: 'ANTHROPIC_API_KEY', desc: 'Anthropic API key for Claude' },
            { key: 'ALPHA_VANTAGE_API_KEY', desc: 'Alpha Vantage API key (free at alphavantage.co)' },
          ].map(({ key, desc }) => (
            <div key={key} className="flex items-start gap-3 py-2 border-b border-white/5">
              <code className="text-[#AAFF00] font-mono text-xs w-64 flex-shrink-0">{key}</code>
              <span className="text-white/30 text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-5">
        <h2 className="text-yellow-400 text-xs font-mono tracking-widest uppercase mb-2">Legal Disclaimer</h2>
        <p className="text-yellow-400/70 text-sm leading-relaxed">
          This platform is for educational and simulation purposes only. No real money is invested.
          All trades are paper trades executed in a simulated environment. AlphaBot&apos;s AI analysis
          does not constitute financial advice. Past simulated performance does not guarantee future results.
          Always consult a licensed financial advisor before making real investment decisions.
        </p>
      </div>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-5 py-3 bg-[#AAFF00] text-black font-mono font-bold rounded-lg hover:bg-[#AAFF00]/80 transition-all shadow-[0_0_20px_rgba(170,255,0,0.2)]"
      >
        <Save size={16} />
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
