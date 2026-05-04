import type { PlanRequest, PlanResult, WorkflowStep } from '../types/contracts';
import { runMultiStepFlow } from '../../workflows/multi-step-flow';

export class PlannerCore {
    buildPlan(request: PlanRequest): PlanResult {
        const flowResult = runMultiStepFlow(request);
        const steps: WorkflowStep[] = flowResult.steps;

        return {
            projectId: flowResult.projectId,
            steps,
            summary: flowResult.summary,
        };
    }
}
