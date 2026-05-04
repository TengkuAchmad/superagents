import type { PlanRequest, RuntimeRouteResolution } from '../../types/contracts';
import { AgentController } from '../controllers/agent-controller';

export class AgentRoutes {
    private readonly controller = new AgentController();

    postPlan(payload: PlanRequest) {
        return this.controller.plan(payload);
    }

    postResolve(payload: PlanRequest): RuntimeRouteResolution {
        return this.controller.resolveRuntime(payload);
    }
}
