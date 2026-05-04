import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface BucketRow { bucket: string; actions: number; tools: number; memory: number; }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = Math.min(parseInt(searchParams.get('hours') || '24'), 168);
    const projectId = searchParams.get('project_id');
    const db = getDb();

    const filterParams = projectId ? [projectId, `-${hours}`] : [`-${hours}`];
    const filterWhere = projectId ? 'AND project_id = ?' : '';

    const agentBuckets = db.prepare(`
      SELECT
        strftime('%Y-%m-%dT%H:00:00Z', timestamp) as bucket,
        COUNT(*) as cnt
      FROM agent_log
      WHERE timestamp >= datetime('now', ? || ' hours') ${filterWhere}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(...filterParams) as { bucket: string; cnt: number }[];

    const toolBuckets = db.prepare(`
      SELECT
        strftime('%Y-%m-%dT%H:00:00Z', timestamp) as bucket,
        COUNT(*) as cnt
      FROM tool_calls
      WHERE timestamp >= datetime('now', ? || ' hours') ${filterWhere}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(...filterParams) as { bucket: string; cnt: number }[];

    const memBuckets = db.prepare(`
      SELECT
        strftime('%Y-%m-%dT%H:00:00Z', timestamp) as bucket,
        COUNT(*) as cnt
      FROM memory_updates
      WHERE timestamp >= datetime('now', ? || ' hours') ${filterWhere}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(...filterParams) as { bucket: string; cnt: number }[];

    const bucketMap = new Map<string, BucketRow>();
    for (const { bucket, cnt } of agentBuckets) {
      bucketMap.set(bucket, { bucket, actions: cnt, tools: 0, memory: 0 });
    }
    for (const { bucket, cnt } of toolBuckets) {
      const existing = bucketMap.get(bucket) ?? { bucket, actions: 0, tools: 0, memory: 0 };
      bucketMap.set(bucket, { ...existing, tools: cnt });
    }
    for (const { bucket, cnt } of memBuckets) {
      const existing = bucketMap.get(bucket) ?? { bucket, actions: 0, tools: 0, memory: 0 };
      bucketMap.set(bucket, { ...existing, memory: cnt });
    }

    const timeline = Array.from(bucketMap.values()).sort((a, b) =>
      a.bucket.localeCompare(b.bucket)
    );

    return NextResponse.json({ hours, timeline });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
