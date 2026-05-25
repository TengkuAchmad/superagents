import { getDb } from '@/lib/db';

interface MaxIds {
  agent_log: number;
  tool_calls: number;
  memory_updates: number;
  planning_log: number;
}

function getMaxIds(db: ReturnType<typeof getDb>, projectId: string | null): MaxIds {
  const pf = projectId ? 'WHERE project_id = ?' : '';
  const a = projectId ? [projectId] : [];
  const q = (table: string): number =>
    ((db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${table} ${pf}`).get(...a) as { m: number }).m);
  return {
    agent_log: q('agent_log'),
    tool_calls: q('tool_calls'),
    memory_updates: q('memory_updates'),
    planning_log: q('planning_log'),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id') || null;
  const db = getDb();
  let prev = getMaxIds(db, projectId);

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      send({ type: 'connected', ...prev });

      const timer = setInterval(() => {
        try {
          const curr = getMaxIds(db, projectId);
          const changed = (Object.keys(curr) as (keyof MaxIds)[]).some(
            (k) => curr[k] !== prev[k],
          );
          if (changed) {
            send({ type: 'update', ...curr });
            prev = curr;
          }
        } catch {
          clearInterval(timer);
        }
      }, 800);

      request.signal?.addEventListener('abort', () => clearInterval(timer));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
