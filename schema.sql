-- AlphaBot Database Schema
-- Run this in your Supabase SQL Editor

-- Portfolio state
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  cash_balance DECIMAL(15,2) DEFAULT 4000.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Holdings
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  shares DECIMAL(10,4) NOT NULL,
  avg_cost_basis DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade log
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY','SELL','HOLD')),
  shares DECIMAL(10,4),
  price DECIMAL(10,2),
  total_value DECIMAL(15,2),
  reasoning TEXT,
  confidence DECIMAL(4,3),
  indicators_snapshot JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Bot runs
CREATE TABLE IF NOT EXISTS bot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  decisions_made INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running'
);

-- Portfolio value history
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  total_value DECIMAL(15,2),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ===== AUTOPILOT ADDITIONS =====

-- Autopilot settings (one row per portfolio)
CREATE TABLE IF NOT EXISTS autopilot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  defensive_mode BOOLEAN DEFAULT false,
  defensive_mode_reason TEXT,
  consecutive_losses INT DEFAULT 0,
  peak_portfolio_value DECIMAL(15,2) DEFAULT 4000.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Smart alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  related_symbol TEXT,
  related_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL
);

-- Exit monitoring log
CREATE TABLE IF NOT EXISTS exit_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID,
  symbol TEXT NOT NULL,
  check_time TIMESTAMPTZ DEFAULT NOW(),
  current_price DECIMAL(10,2),
  stop_loss_price DECIMAL(10,2),
  target_price DECIMAL(10,2),
  rsi DECIMAL(6,2),
  macd_histogram DECIMAL(10,5),
  days_held INT,
  action_taken TEXT DEFAULT 'MONITOR',
  reason TEXT
);

-- Bot activity log (live feed)
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  symbol TEXT,
  metadata JSONB
);

-- Add sell_target and stop_loss columns to positions if not present
ALTER TABLE positions ADD COLUMN IF NOT EXISTS sell_target DECIMAL(10,2);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(10,2);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS bought_at TIMESTAMPTZ DEFAULT NOW();

-- Row Level Security (enable after setup)
-- ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_runs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Insert a demo portfolio (for testing without auth)
INSERT INTO portfolios (cash_balance) VALUES (4000.00)
ON CONFLICT DO NOTHING;
