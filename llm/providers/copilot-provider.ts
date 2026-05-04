import type { ProviderConfig } from '../../types/contracts';

export class CopilotProvider {
    readonly name = 'github-copilot';

    constructor(private readonly config: ProviderConfig) { }

    getPrimaryModel(): string {
        return this.config.primaryModel;
    }

    getFallbackModels(): string[] {
        return [...this.config.fallbackModels];
    }
}
