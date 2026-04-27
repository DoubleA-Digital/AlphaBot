'use client';

import { useState } from 'react';
import { Search, TrendingUp, TrendingDown, AlertCircle, Loader, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import StockChart from '@/components/charts/StockChart';
import type { ResearchData } from '@/types';
import { DEFAULT_WATCHLIST } from '@/lib/constants';

export default function ResearchPage() {
  const [symbol, setSymbol] = useState('');
  const [data, setData] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (ticker?: string) => {
    const sym = (ticker ?? symbol).toUpperCase().trim();
    if (!sym) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/research/${sym}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `No data for ${sym}`);
      }
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  const ind = data?.indicators;
  const q = data?.quote;
  const analysis = data?.analysis;

  const sma20 = ind?.sma20 ? Array(data?.history.length ?? 0).fill(ind.sma20) : [];
  const sma50 = ind?.sma50 ? Array(data?.history.length ?? 0).fill(ind.sma50) : [];

  const IndicatorRow = ({
    label, value, signal, bar,
  }: { label: string; value: string; signal?: 'bull' | 'bear' | 'neutral'; bar?: number }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5">
      <span className="text-white/40 text-xs font-mono">{label}</span>
      <div className="flex items-center gap-2">
        {bar !== undefined && (
          <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full', signal === 'bull' ? 'bg-[#AAFF00]' : signal === 'bear' ? 'bg-red-400' : 'bg-white/30')}
              style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
            />
          </div>
        )}
        <span className={clsx('text-sm font-mono font-medium tabular-nums',
          signal === 'bull' ? 'text-[#AAFF00]' : signal === 'bear' ? 'text-red-400' : 'text-white'
        )}>
          {value}
        </span>
      </div>
    </div>
  );

  return (
    <div className="p-5 space-y-5 grid-bg min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>Market Research</h1>
        <p className="text-white/40 text-xs font-mono mt-0.5">AI-powered technical analysis · Real-time charts · Price forecasting</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Enter ticker symbol — e.g. AAPL, NVDA, TSLA"
            className="w-full bg-[#111] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white font-mono text-sm placeholder-white/20 focus:outline-none focus:border-[#AAFF00]/40 transition-colors"
          />
        </div>
        <button
          onClick={() => search()}
          disabled={loading || !symbol}
          className="px-5 py-3 bg-[#AAFF00] text-black font-mono font-bold rounded-lg hover:bg-[#AAFF00]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading ? <Loader size={16} className="animate-spin" /> : 'Analyze'}
        </button>
      </div>

      {/* Quick picks */}
      <div className="flex flex-wrap gap-2">
        {DEFAULT_WATCHLIST.slice(0, 12).map(t => (
          <button
            key={t}
            onClick={() => { setSymbol(t); search(t); }}
            className="px-2.5 py-1 bg-white/5 border border-white/10 rounded text-white/50 text-xs font-mono hover:border-[#AAFF00]/30 hover:text-[#AAFF00] transition-all"
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-mono flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && (
        <div className="bg-[#111] border border-white/10 rounded-lg p-16 flex flex-col items-center gap-4">
          <Loader size={32} className="text-[#AAFF00] animate-spin" />
          <div className="text-white/40 text-sm font-mono">Fetching market data · Computing indicators · Running AI analysis...</div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Header bar */}
          <div className="bg-[#111] border border-white/10 rounded-lg p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="text-4xl font-mono font-bold text-white">{data.symbol}</div>
                <div className="text-white/30 text-xs font-mono mt-1">Last updated: {q?.timestamp ?? 'N/A'}</div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-mono font-bold text-white">${q?.price.toFixed(2)}</div>
                <div className={clsx('text-sm font-mono flex items-center justify-end gap-1 mt-1', (q?.change ?? 0) >= 0 ? 'text-[#AAFF00]' : 'text-red-400')}>
                  {(q?.change ?? 0) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {(q?.change ?? 0) >= 0 ? '+' : ''}{q?.change.toFixed(2)} ({(q?.changePercent ?? 0).toFixed(2)}%)
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/10">
              {[
                { label: 'Open', value: `$${q?.open.toFixed(2)}` },
                { label: 'High', value: `$${q?.high.toFixed(2)}` },
                { label: 'Low', value: `$${q?.low.toFixed(2)}` },
                { label: 'Volume', value: `${((q?.volume ?? 0) / 1e6).toFixed(1)}M` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-[10px] font-mono text-white/30 uppercase">{label}</div>
                  <div className="text-sm font-mono text-white mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Full stock chart */}
          <div className="bg-[#111] border border-white/10 rounded-lg p-5">
            <StockChart
              data={data.history}
              symbol={data.symbol}
              sma20={sma20}
              sma50={sma50}
              height={380}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Technical Indicators */}
            <div className="bg-[#111] border border-white/10 rounded-lg p-5">
              <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4">Technical Indicators</h2>
              {ind && (
                <>
                  <IndicatorRow
                    label="RSI (14)"
                    value={ind.rsi14 ? `${ind.rsi14.toFixed(2)}` : 'N/A'}
                    signal={ind.rsi14 ? (ind.rsi14 > 70 ? 'bear' : ind.rsi14 < 30 ? 'bull' : 'neutral') : undefined}
                    bar={ind.rsi14 ?? undefined}
                  />
                  <IndicatorRow
                    label="MACD Signal"
                    value={ind.macd ? (ind.macd.histogram > 0 ? 'Bullish Cross' : 'Bearish Cross') : 'N/A'}
                    signal={ind.macd ? (ind.macd.histogram > 0 ? 'bull' : 'bear') : undefined}
                  />
                  <IndicatorRow
                    label="MACD Histogram"
                    value={ind.macd?.histogram.toFixed(4) ?? 'N/A'}
                    signal={ind.macd ? (ind.macd.histogram > 0 ? 'bull' : 'bear') : undefined}
                  />
                  <IndicatorRow
                    label="SMA 20"
                    value={ind.sma20 ? `$${ind.sma20.toFixed(2)}` : 'N/A'}
                    signal={ind.sma20 && ind.price > ind.sma20 ? 'bull' : 'bear'}
                  />
                  <IndicatorRow
                    label="SMA 50"
                    value={ind.sma50 ? `$${ind.sma50.toFixed(2)}` : 'N/A'}
                    signal={ind.sma50 && ind.price > ind.sma50 ? 'bull' : 'bear'}
                  />
                  <IndicatorRow label="BB Upper" value={ind.bollingerBands ? `$${ind.bollingerBands.upper.toFixed(2)}` : 'N/A'} />
                  <IndicatorRow label="BB Lower" value={ind.bollingerBands ? `$${ind.bollingerBands.lower.toFixed(2)}` : 'N/A'} />
                  <IndicatorRow
                    label="Volume Ratio"
                    value={ind.volumeRatio ? `${ind.volumeRatio.toFixed(2)}x avg` : 'N/A'}
                    signal={ind.volumeRatio ? (ind.volumeRatio > 1.5 ? 'bull' : ind.volumeRatio < 0.7 ? 'bear' : 'neutral') : undefined}
                  />
                  <IndicatorRow label="52W High" value={ind.weekHigh52 ? `$${ind.weekHigh52.toFixed(2)}` : 'N/A'} />
                  <IndicatorRow label="52W Low" value={ind.weekLow52 ? `$${ind.weekLow52.toFixed(2)}` : 'N/A'} />
                  {ind.weekHighProximity52 !== null && ind.weekHighProximity52 !== undefined && (
                    <IndicatorRow
                      label="Distance from 52W High"
                      value={`${ind.weekHighProximity52.toFixed(1)}%`}
                      signal={ind.weekHighProximity52 < 5 ? 'bear' : 'neutral'}
                    />
                  )}
                </>
              )}
            </div>

            {/* AI Analysis */}
            {analysis ? (
              <div className="bg-[#111] border border-white/10 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase">Claude AI Analysis</h2>
                  <div className="flex items-center gap-1.5">
                    <Zap size={10} className="text-[#AAFF00]" />
                    <span className="text-[10px] font-mono text-[#AAFF00]">AI</span>
                  </div>
                </div>

                <div className={clsx(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold',
                  analysis.sentiment === 'bullish' ? 'bg-[#AAFF00]/20 text-[#AAFF00] border border-[#AAFF00]/30' :
                  analysis.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  'bg-white/10 text-white/50 border border-white/10'
                )}>
                  {analysis.sentiment === 'bullish' ? '▲' : analysis.sentiment === 'bearish' ? '▼' : '—'} {analysis.sentiment.toUpperCase()}
                </div>

                <p className="text-white/70 text-sm leading-relaxed">{analysis.summary}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                    <div className="text-white/30 text-[10px] font-mono mb-1 uppercase tracking-wider">7-Day Target</div>
                    <div className="text-[#AAFF00] font-mono font-bold text-lg">${analysis.priceTarget7day?.toFixed(2)}</div>
                    <div className="text-white/40 text-xs mt-1 leading-relaxed">{analysis.outlook7day}</div>
                  </div>
                  <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                    <div className="text-white/30 text-[10px] font-mono mb-1 uppercase tracking-wider">30-Day Target</div>
                    <div className="text-[#AAFF00] font-mono font-bold text-lg">${analysis.priceTarget30day?.toFixed(2)}</div>
                    <div className="text-white/40 text-xs mt-1 leading-relaxed">{analysis.outlook30day}</div>
                  </div>
                </div>

                {analysis.catalysts?.length > 0 && (
                  <div>
                    <div className="text-white/30 text-[10px] font-mono mb-2 tracking-widest uppercase">Catalysts</div>
                    <div className="space-y-1">
                      {analysis.catalysts.map((c, i) => (
                        <div key={i} className="text-[#AAFF00]/60 text-xs py-1 border-b border-white/5 font-mono flex items-start gap-2">
                          <span className="text-[#AAFF00]/40 mt-0.5">+</span>{c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.keyRisks?.length > 0 && (
                  <div>
                    <div className="text-white/30 text-[10px] font-mono mb-2 tracking-widest uppercase">Key Risks</div>
                    <div className="space-y-1">
                      {analysis.keyRisks.map((r, i) => (
                        <div key={i} className="text-red-400/60 text-xs py-1 border-b border-white/5 font-mono flex items-start gap-2">
                          <span className="text-red-400/40 mt-0.5">−</span>{r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#111] border border-white/10 rounded-lg p-5 flex items-center justify-center text-white/20 text-sm font-mono">
                Configure Anthropic API key for AI analysis
              </div>
            )}
          </div>
        </div>
      )}

      {/* Default state: show market overview */}
      {!data && !loading && !error && (
        <div className="bg-[#111] border border-white/10 rounded-lg p-10 text-center space-y-3">
          <Search size={32} className="text-white/20 mx-auto" />
          <div className="text-white/30 text-sm font-mono">Search any ticker above to see its full chart and AI analysis</div>
          <div className="text-white/15 text-xs font-mono">Supports any US-listed stock, ETF, or index</div>
        </div>
      )}
    </div>
  );
}
