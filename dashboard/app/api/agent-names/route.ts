import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const NAMES_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'agent-data', 'agent-names.json'
);

const DEFAULTS: Record<string, string> = {
  prabowo: 'Orchestrator',
  gibran: 'Planner',
  suharso: 'Executor',
  dudung: 'Task Runner',
  mahfud: 'Oracle',
  'hasan-nasbi': 'Memory Keeper',
  'andi-arief': 'Chronicler',
  bakom: 'Librarian',
  'sri-mulyani': 'Analyst',
  explore: 'Explorer',
  'multimodal-looker': 'Media Analyst',
};

export async function GET() {
  try {
    const saved = existsSync(NAMES_FILE)
      ? (JSON.parse(readFileSync(NAMES_FILE, 'utf-8')) as Record<string, string>)
      : {};
    return NextResponse.json({ names: { ...DEFAULTS, ...saved } });
  } catch {
    return NextResponse.json({ names: DEFAULTS });
  }
}

export async function PUT(req: Request) {
  try {
    const { names } = (await req.json()) as { names: Record<string, string> };
    writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
