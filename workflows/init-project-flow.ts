import type { ProjectContext } from '../types/contracts';

export interface InitProjectResult {
    accepted: boolean;
    project: ProjectContext;
    notes: string[];
}

export function runInitProjectFlow(project: ProjectContext): InitProjectResult {
    return {
        accepted: Boolean(project.projectId),
        project,
        notes: ['Phase 1 scaffold; persistence wiring happens in Phase 2/3.'],
    };
}
