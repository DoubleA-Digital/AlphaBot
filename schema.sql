-- AlphaBot Database Schema
-- Run this in your Supabase SQL Editor

-- Portfolio state
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  cash_balance DECIMAL(15,2) DEFAULT 100000.00,
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

-- Row Level Security (enable after setup)
-- ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_runs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Insert a demo portfolio (for testing without auth)
INSERT INTO portfolios (cash_balance) VALUES (100000.00)
ON CONFLICT DO NOTHING;
