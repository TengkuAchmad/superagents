import type { MemoryQuery, MemoryResult } from '../types/contracts';

export class MemoryManagerCore {
    recall(query: MemoryQuery): MemoryResult {
        return {
            projectId: query.projectId,
            entries: [],
            source: 'scaffold',
        };
    }
}
