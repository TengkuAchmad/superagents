import type { ExecutionRequest, ExecutionResult } from '../types/contracts';

export function runTaskFlow(request: ExecutionRequest): ExecutionResult {
    return {
        projectId: request.projectId,
        success: true,
        message: `Task flow scaffold completed for workflow ${request.workflowId}.`,
        durationMs: 0,
        completedSteps: request.steps?.map((step) => step.id) ?? [],
    };
}
