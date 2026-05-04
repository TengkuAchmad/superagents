import { NextResponse } from 'next/server';
import { AgentApiServer } from '../../../../api/server';
import type { PlanRequest } from '../../../../types/contracts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const apiServer = new AgentApiServer();

function isValidPlanRequest(payload: unknown): payload is PlanRequest {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const candidate = payload as Record<string, unknown>;
    return (
        typeof candidate.projectId === 'string' &&
        candidate.projectId.trim().length > 0 &&
        typeof candidate.goal === 'string' &&
        candidate.goal.trim().length > 0
    );
}

export async function POST(request: Request) {
    try {
        const payload: unknown = await request.json();

        if (!isValidPlanRequest(payload)) {
            return NextResponse.json(
                { error: 'Invalid payload. Required fields: projectId (string), goal (string).' },
                { status: 400 }
            );
        }

        const data = apiServer.agent.postResolve(payload);
        return NextResponse.json({ data });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
