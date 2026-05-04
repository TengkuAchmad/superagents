export interface AnalyticsSummary {
    actions: number;
    toolCalls: number;
    memoryUpdates: number;
}

export class AnalyticsController {
    summary(): AnalyticsSummary {
        return {
            actions: 0,
            toolCalls: 0,
            memoryUpdates: 0,
        };
    }
}
