import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

interface MCPStatus {
  name: string;
  label: string;
  status: 'ok' | 'error';
  latency_ms: number;
  detail: string;
}

interface MCPHealthResponse {
  checked_at: string;
  mcps: MCPStatus[];
}

function probe(name: string, label: string, fn: () => string): MCPStatus {
  const start = Date.now();
  try {
    const detail = fn();
    return { name, label, status: 'ok', latency_ms: Date.now() - start, detail };
  } catch (error) {
    return {
      name,
      label,
      status: 'error',
      latency_ms: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const baseDir = path.join(home, '.config', 'opencode', 'agent-data');

  const mcps: MCPStatus[] = [
    probe('sqlite', 'SQLite', () => {
      const stat = fs.statSync(path.join(baseDir, 'agent.db'));
      return `agent.db ${(stat.size / 1024).toFixed(1)} KB`;
    }),
    probe('memory', 'Memory', () => {
      const stat = fs.statSync(path.join(baseDir, 'memory.jsonl'));
      return `memory.jsonl ${(stat.size / 1024).toFixed(1)} KB`;
    }),
    probe('filesystem', 'Filesystem', () => {
      const entries = fs.readdirSync(baseDir);
      return `${entries.length} entries in agent-data/`;
    }),
    probe('vector-memory', 'Vector DB', () => {
      const stat = fs.statSync(path.join(baseDir, 'vector-store', 'chroma.sqlite3'));
      return `chroma.sqlite3 ${(stat.size / 1024).toFixed(1)} KB`;
    }),
    probe('sequential-thinking', 'Seq. Thinking', () => `node ${process.version} available`),
  ];

  const result: MCPHealthResponse = { checked_at: new Date().toISOString(), mcps };
  return NextResponse.json(result);
}
