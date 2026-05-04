import type { ProviderConfig } from '../../types/contracts';

export class AnthropicProvider {
    readonly name = 'anthropic';

    constructor(private readonly config: ProviderConfig) { }

    getFallbackModel(): string | undefined {
        return this.config.fallbackModels[0];
    }

    getPrimaryModel(): string {
        return this.config.primaryModel;
    }
}
