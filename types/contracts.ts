export type AgentType =
    | 'orchestrator'
    | 'planner'
    | 'executor'
    | 'memory-manager'
    | 'decision-engine'
    | 'tool-caller'
    | 'filesystem'
    | 'logger';

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface ProjectContext {
    projectId: string;
    projectName?: string;
    repoPath?: string;
    conventions?: string[];
    techStack?: string[];
}

export interface WorkflowStep {
    id: string;
    title: string;
    status: StepStatus;
    owner?: AgentType;
    files?: string[];
    notes?: string[];
}

export interface PlanRequest {
    projectId: string;
    goal: string;
    constraints?: string[];
    context?: string;
    estimatedFiles?: number;
    domains?: string[];
}

export interface PlanResult {
    projectId: string;
    summary: string;
    steps: WorkflowStep[];
}

export interface ExecutionRequest {
    projectId: string;
    workflowId: string;
    steps?: WorkflowStep[];
}

export interface ExecutionResult {
    projectId: string;
    success: boolean;
    message: string;
    durationMs: number;
    completedSteps?: string[];
}

export interface MemoryQuery {
    projectId: string;
    query?: string;
    limit?: number;
}

export interface MemoryEntry {
    id?: string;
    text: string;
    timestamp?: string;
    source?: string;
}

export interface MemoryResult {
    projectId: string;
    entries: MemoryEntry[];
    source: 'memory-mcp' | 'vector-memory-mcp' | 'scaffold';
}

export interface DecisionRequest {
    projectId: string;
    problem: string;
    options?: string[];
}

export interface DecisionResult {
    projectId: string;
    recommendation: string;
    confidence: 'low' | 'medium' | 'high';
    notes: string[];
}

export interface LogEntry {
    projectId: string;
    agentName: string;
    action: string;
    status: 'started' | 'completed' | 'failed' | 'warning';
    description?: string;
    result?: string;
    durationMs?: number;
}

export interface RouteDecision {
    target: AgentType;
    reason: string;
}

export interface TaskSizeAssessment {
    isLarge: boolean;
    reasons: string[];
    estimatedFiles: number;
    domainCount: number;
}

export interface ProviderConfig {
    primaryModel: string;
    fallbackModels: string[];
}

export interface RuntimeProviderSelection {
    provider: 'copilot' | 'anthropic';
    sourceAgent: string;
    primaryModel: string;
    fallbackModels: string[];
}

export interface RuntimeRouteResolution {
    route: RouteDecision;
    provider: RuntimeProviderSelection;
    planPreview: PlanResult;
}
