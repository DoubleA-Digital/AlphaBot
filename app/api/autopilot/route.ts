import { NextResponse } from 'next/server';
import { getAutopilotSettings, saveAutopilotSettings } from '@/lib/autopilot';

export async function GET() {
  const settings = await getAutopilotSettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const current = await getAutopilotSettings();

    const updated = {
      ...current,
      isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : current.isEnabled,
      activatedAt: body.isEnabled ? (current.activatedAt ?? new Date().toISOString()) : null,
      defensiveMode: typeof body.defensiveMode === 'boolean' ? body.defensiveMode : current.defensiveMode,
      defensiveModeReason: body.defensiveModeReason ?? current.defensiveModeReason,
      consecutiveLosses: typeof body.consecutiveLosses === 'number' ? body.consecutiveLosses : current.consecutiveLosses,
      peakPortfolioValue: typeof body.peakPortfolioValue === 'number' ? body.peakPortfolioValue : current.peakPortfolioValue,
    };

    await saveAutopilotSettings(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
