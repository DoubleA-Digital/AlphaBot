// Shared autopilot state utilities (server-side)

export interface AutopilotSettings {
  isEnabled: boolean;
  activatedAt: string | null;
  defensiveMode: boolean;
  defensiveModeReason: string | null;
  consecutiveLosses: number;
  peakPortfolioValue: number;
}

// In-memory fallback when Supabase is unavailable
let memAutopilot: AutopilotSettings = {
  isEnabled: false,
  activatedAt: null,
  defensiveMode: false,
  defensiveModeReason: null,
  consecutiveLosses: 0,
  peakPortfolioValue: 4000,
};

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

export async function getAutopilotSettings(): Promise<AutopilotSettings> {
  if (!hasSupabase) return memAutopilot;
  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('autopilot_settings')
      .select('*')
      .limit(1)
      .single();
    if (!data) return memAutopilot;
    return {
      isEnabled: data.is_enabled ?? false,
      activatedAt: data.activated_at ?? null,
      defensiveMode: data.defensive_mode ?? false,
      defensiveModeReason: data.defensive_mode_reason ?? null,
      consecutiveLosses: data.consecutive_losses ?? 0,
      peakPortfolioValue: data.peak_portfolio_value ?? 4000,
    };
  } catch {
    return memAutopilot;
  }
}

export async function saveAutopilotSettings(settings: AutopilotSettings): Promise<void> {
  memAutopilot = settings;
  if (!hasSupabase) return;
  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();

    // Get portfolio ID
    const { data: portfolios } = await supabase.from('portfolios').select('id').limit(1);
    const portfolioId = portfolios?.[0]?.id;
    if (!portfolioId) return;

    await supabase.from('autopilot_settings').upsert({
      portfolio_id: portfolioId,
      is_enabled: settings.isEnabled,
      activated_at: settings.activatedAt,
      defensive_mode: settings.defensiveMode,
      defensive_mode_reason: settings.defensiveModeReason,
      consecutive_losses: settings.consecutiveLosses,
      peak_portfolio_value: settings.peakPortfolioValue,
    }, { onConflict: 'portfolio_id' });
  } catch { /* silent */ }
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // weekend

  // Convert to ET (UTC-4 EDT approximation)
  const etHour = now.getUTCHours() - 4;
  const etMinute = now.getUTCMinutes();
  const etTotalMinutes = etHour * 60 + etMinute;

  const marketOpen = 9 * 60 + 30; // 9:30 AM ET
  const marketClose = 16 * 60; // 4:00 PM ET

  return etTotalMinutes >= marketOpen && etTotalMinutes < marketClose;
}

export function getMarketSession(): string {
  const now = new Date();
  const etHour = now.getUTCHours() - 4;
  const etMin = now.getUTCMinutes();
  const t = etHour * 60 + etMin;

  if (t < 9 * 60 + 30) return 'pre-market';
  if (t < 10 * 60) return 'open'; // 9:30-10:00 high vol
  if (t < 11 * 60 + 30) return 'morning-trend';
  if (t < 13 * 60) return 'midday-chop';
  if (t < 14 * 60 + 30) return 'afternoon-setup';
  if (t < 15 * 60 + 45) return 'power-hour';
  if (t < 16 * 60) return 'close';
  return 'after-hours';
}

export async function logActivity(
  portfolioId: string | null,
  eventType: string,
  message: string,
  symbol?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!hasSupabase || !portfolioId) return;
  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();
    await supabase.from('activity_log').insert({
      portfolio_id: portfolioId,
      event_type: eventType,
      message,
      symbol: symbol ?? null,
      metadata: metadata ?? null,
    });
  } catch { /* silent */ }
}

export async function createAlert(
  portfolioId: string | null,
  type: string,
  title: string,
  body: string,
  symbol?: string,
  tradeId?: string
): Promise<void> {
  if (!hasSupabase || !portfolioId) return;
  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();
    await supabase.from('alerts').insert({
      portfolio_id: portfolioId,
      type,
      title,
      body,
      related_symbol: symbol ?? null,
      related_trade_id: tradeId ?? null,
    });
  } catch { /* silent */ }
}
