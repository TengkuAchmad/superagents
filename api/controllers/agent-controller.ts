import type { PlanRequest, PlanResult, RuntimeRouteResolution } from '../../types/contracts';
import { OrchestratorCore } from '../../agent/core/orchestrator';
import { PlannerCore } from '../../agent/core/planner';

export class AgentController {
    private readonly planner = new PlannerCore();
    private readonly orchestrator = new OrchestratorCore();

    plan(request: PlanRequest): PlanResult {
        return this.planner.buildPlan(request);
    }

    resolveRuntime(request: PlanRequest): RuntimeRouteResolution {
        const route = this.orchestrator.decideRoute(request);
        const providerSelection = this.orchestrator.resolveProviderForRoute(route);
        const planPreview = this.planner.buildPlan(request);

        return {
            route,
            provider: {
                provider: providerSelection.provider,
                sourceAgent: providerSelection.sourceAgent,
                primaryModel: providerSelection.config.primaryModel,
                fallbackModels: providerSelection.config.fallbackModels,
            },
            planPreview,
        };
    }
}
