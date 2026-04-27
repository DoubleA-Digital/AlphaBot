export interface Portfolio {
  id: string;
  user_id: string;
  cash_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  portfolio_id: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number;
  created_at: string;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
}

export interface Trade {
  id: string;
  portfolio_id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  shares: number | null;
  price: number | null;
  total_value: number | null;
  reasoning: string | null;
  confidence: number | null;
  indicators_snapshot: Record<string, unknown> | null;
  timestamp: string;
}

export interface BotRun {
  id: string;
  portfolio_id: string;
  started_at: string;
  completed_at: string | null;
  decisions_made: number;
  status: 'running' | 'completed' | 'error';
}

export interface PortfolioSnapshot {
  id: string;
  portfolio_id: string;
  total_value: number;
  timestamp: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  symbol: string;
  price: number;
  rsi14: number | null;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  } | null;
  sma20: number | null;
  sma50: number | null;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  } | null;
  volumeRatio: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  weekHighProximity52: number | null;
  weekLowProximity52: number | null;
}

export interface ClaudeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  shares: number;
  reasoning: string;
  confidence: number;
  risk_score: number;
  price_target: number;
  stop_loss: number;
  market_regime: 'trending_up' | 'trending_down' | 'ranging';
  key_signals: string[];
}

export interface BotDecisionLog {
  symbol: string;
  decision: ClaudeDecision;
  indicators: TechnicalIndicators;
  executed: boolean;
  error?: string;
  timestamp: string;
}

export interface PortfolioStats {
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  totalPnl: number;
  totalPnlPct: number;
  todayPnl: number;
  todayPnlPct: number;
  winRate: number;
  positions: Position[];
  snapshots: PortfolioSnapshot[];
}

export interface ResearchData {
  symbol: string;
  quote: StockQuote;
  history: OHLCVBar[];
  indicators: TechnicalIndicators;
  analysis: {
    summary: string;
    outlook7day: string;
    outlook30day: string;
    priceTarget7day: number;
    priceTarget30day: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    keyRisks: string[];
    catalysts: string[];
  };
}
