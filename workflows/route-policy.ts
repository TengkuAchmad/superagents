import type { PlanRequest, RouteDecision } from '../agent/types/contracts';
import { assessTaskSize } from './multi-step-flow';

function containsAny(text: string, terms: string[]): boolean {
    const normalized = text.toLowerCase();
    return terms.some((term) => normalized.includes(term));
}

export function decideRouteFromPolicy(request: PlanRequest): RouteDecision {
    const goal = request.goal.toLowerCase();

    if (containsAny(goal, ['strategy', 'architecture', 'tradeoff', 'microservice'])) {
        return {
            target: 'decision-engine',
            reason: 'Strategic request routed to decision-engine policy.',
        };
    }

    if (containsAny(goal, ['remember', 'recall', 'memory', 'knowledge'])) {
        return {
            target: 'memory-manager',
            reason: 'Memory-centric request routed to memory-manager policy.',
        };
    }

    const size = assessTaskSize(request);
    if (size.isLarge) {
        return {
            target: 'planner',
            reason: `Large task routed to planner: ${size.reasons.join('; ')}`,
        };
    }

    return {
        target: 'executor',
        reason: 'Scoped task routed to executor policy.',
    };
}
