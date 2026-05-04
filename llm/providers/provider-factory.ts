import type { ProviderConfig } from '../../types/contracts';
import { AnthropicProvider } from './anthropic-provider';
import { CopilotProvider } from './copilot-provider';

declare const require: (id: string) => any;

export type ProviderKind = 'copilot' | 'anthropic';

export interface ProviderSelection {
    provider: ProviderKind;
    config: ProviderConfig;
    sourceAgent: string;
}

interface OhMyOpenAgentAgentConfig {
    model?: string;
    fallback_models?: Array<{ model?: string }>;
}

interface OhMyOpenAgentConfig {
    agents?: Record<string, OhMyOpenAgentAgentConfig>;
}

function getDefaultConfigPath(): string {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const home = env.USERPROFILE || env.HOME || '';
    const pathModule = require('node:path') as { join: (...parts: string[]) => string };
    return pathModule.join(home, '.config', 'opencode', 'oh-my-openagent.json');
}

function inferProviderKind(model: string): ProviderKind {
    return model.includes('claude') ? 'anthropic' : 'copilot';
}

function normalizeConfig(agent: OhMyOpenAgentAgentConfig): ProviderConfig {
    const primary = agent.model ?? 'github-copilot/gpt-4.1';
    const fallbackModels = (agent.fallback_models ?? [])
        .map((entry) => entry.model)
        .filter((value): value is string => Boolean(value));

    return {
        primaryModel: primary,
        fallbackModels,
    };
}

export class ProviderFactory {
    private readonly configPath: string;

    constructor(configPath?: string) {
        this.configPath = configPath ?? getDefaultConfigPath();
    }

    create(kind: ProviderKind, config: ProviderConfig): CopilotProvider | AnthropicProvider {
        if (kind === 'anthropic') {
            return new AnthropicProvider(config);
        }

        return new CopilotProvider(config);
    }

    resolveForAgent(agentName: string): ProviderSelection {
        const fallback: ProviderSelection = {
            provider: 'copilot',
            config: {
                primaryModel: 'github-copilot/gpt-4.1',
                fallbackModels: ['github-copilot/claude-sonnet-4.6'],
            },
            sourceAgent: 'fallback',
        };

        try {
            const fsModule = require('node:fs') as {
                existsSync: (filePath: string) => boolean;
                readFileSync: (filePath: string, encoding: string) => string;
            };

            if (!fsModule.existsSync(this.configPath)) {
                return fallback;
            }

            const raw = fsModule.readFileSync(this.configPath, 'utf-8');
            const parsed = JSON.parse(raw) as OhMyOpenAgentConfig;
            const agents = parsed.agents ?? {};
            const config = agents[agentName];

            if (!config) {
                return fallback;
            }

            const normalized = normalizeConfig(config);
            return {
                provider: inferProviderKind(normalized.primaryModel),
                config: normalized,
                sourceAgent: agentName,
            };
        } catch {
            return fallback;
        }
    }
}
