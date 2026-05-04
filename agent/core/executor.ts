import type { ExecutionRequest, ExecutionResult } from '../types/contracts';

export class ExecutorCore {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        return {
            projectId: request.projectId,
            success: true,
            message: `Scaffold execution placeholder for workflow: ${request.workflowId}`,
            durationMs: 0,
        };
    }
}
