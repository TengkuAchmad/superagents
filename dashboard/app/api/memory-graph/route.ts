import { NextResponse } from 'next/server';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';

const MEMORY_JSONL =
  'C:\\Users\\INTEL INSIDE\\.config\\opencode\\agent-data\\memory.jsonl';

export interface MemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface MemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

export interface MemoryGraphResponse {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
  total_entities: number;
  total_relations: number;
  entity_types: { type: string; count: number }[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!fs.existsSync(MEMORY_JSONL)) {
      return NextResponse.json<MemoryGraphResponse>({
        entities: [],
        relations: [],
        total_entities: 0,
        total_relations: 0,
        entity_types: [],
      });
    }

    const raw = fs.readFileSync(MEMORY_JSONL, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);

    const entities: MemoryEntity[] = [];
    const relations: MemoryRelation[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'entity') {
          const name = obj.name ?? '(unnamed)';
          const entityType = obj.entityType ?? 'unknown';
          const observations = Array.isArray(obj.observations) ? obj.observations : [];
          const entryProjectId = obj.project_id ?? null;

          // Dynamic filtering by project_id:
          // 1. If no projectId requested → include all
          // 2. If projectId requested AND entry has project_id → match exact
          // 3. If projectId requested AND entry has NO project_id → match by entity name (backward compat)
          if (projectId) {
            if (entryProjectId && entryProjectId !== projectId) {
              continue; // Skip if entry has different project_id
            }
            // If entry has no project_id, check if name matches projectId (backward compatibility)
            if (!entryProjectId && name !== projectId) {
              continue;
            }
          }

          entities.push({
            name,
            entityType,
            observations,
          });
        } else if (obj.type === 'relation') {
          const from = obj.from ?? '';
          const to = obj.to ?? '';
          const relationProjectId = obj.project_id ?? null;
          const relationType = obj.relationType ?? '';

          // Filter relations by project_id - with backward compat
          if (projectId) {
            if (relationProjectId && relationProjectId !== projectId) {
              continue;
            }
            // If relation has no project_id, check if from/to contains projectId
            if (!relationProjectId && !from.includes(projectId) && !to.includes(projectId)) {
              continue;
            }
          }

          relations.push({
            from,
            to,
            relationType,
          });
        }
      } catch {
        // skip malformed lines
      }
    }

    // Build entity type breakdown
    const typeMap = new Map<string, number>();
    for (const e of entities) {
      typeMap.set(e.entityType, (typeMap.get(e.entityType) ?? 0) + 1);
    }
    const entity_types = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json<MemoryGraphResponse>({
      entities,
      relations,
      total_entities: entities.length,
      total_relations: relations.length,
      entity_types,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
