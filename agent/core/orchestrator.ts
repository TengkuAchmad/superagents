import type { PlanRequest, ProjectContext, RouteDecision } from '../types/contracts';
import { decideRouteFromPolicy } from '../../workflows/route-policy';
import { ProviderFactory, type ProviderSelection } from '../../llm/providers/provider-factory';

export class OrchestratorCore {
    private readonly providerFactory = new ProviderFactory();

    decideRoute(input: PlanRequest): RouteDecision {
        return decideRouteFromPolicy(input);
    }

    resolveProviderForAgent(agentName: string): ProviderSelection {
        return this.providerFactory.resolveForAgent(agentName);
    }

    resolveProviderForRoute(route: RouteDecision): ProviderSelection {
        const routeToAgent: Record<RouteDecision['target'], string> = {
            orchestrator: 'atlas',
            planner: 'prometheus',
            executor: 'sisyphus',
            'memory-manager': 'metis',
            'decision-engine': 'oracle',
            'tool-caller': 'sisyphus-junior',
            filesystem: 'librarian',
            logger: 'momus',
        };

        const agentName = routeToAgent[route.target] ?? 'atlas';
        return this.resolveProviderForAgent(agentName);
    }

    normalizeProjectContext(context: ProjectContext): ProjectContext {
        return {
            ...context,
            projectId: context.projectId.trim(),
        };
    }
}
