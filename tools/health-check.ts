import fs from 'node:fs';
import path from 'node:path';

export interface MCPStatus {
    name: string;
    label: string;
    status: 'ok' | 'error';
    latency_ms: number;
    detail: string;
}

export interface MCPHealthResponse {
    checked_at: string;
    mcps: MCPStatus[];
}

export interface HealthCheckOptions {
    baseDir?: string;
    dbPath?: string;
    memoryJsonlPath?: string;
    vectorStorePath?: string;
}

function getDefaultBaseDir(): string {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const home = env?.USERPROFILE || env?.HOME || '';
    return path.join(home, '.config', 'opencode');
}

export class HealthCheckTool {
    private readonly dbPath: string;
    private readonly memoryJsonlPath: string;
    private readonly vectorStorePath: string;
    private readonly agentDataDir: string;

    constructor(options: HealthCheckOptions = {}) {
        const baseDir = options.baseDir ?? getDefaultBaseDir();
        this.agentDataDir = path.join(baseDir, 'agent-data');
        this.dbPath = options.dbPath ?? path.join(this.agentDataDir, 'agent.db');
        this.memoryJsonlPath = options.memoryJsonlPath ?? path.join(this.agentDataDir, 'memory.jsonl');
        this.vectorStorePath = options.vectorStorePath ?? path.join(this.agentDataDir, 'vector-store', 'chroma.sqlite3');
    }

    private probe(name: string, label: string, fn: () => string): MCPStatus {
        const start = Date.now();
        try {
            const detail = fn();
            return { name, label, status: 'ok', latency_ms: Date.now() - start, detail };
        } catch (error) {
            return {
                name,
                label,
                status: 'error',
                latency_ms: Date.now() - start,
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async probeAll(): Promise<MCPHealthResponse> {
        const mcps: MCPStatus[] = [
            this.probe('sqlite', 'SQLite', () => {
                const stat = fs.statSync(this.dbPath);
                return `agent.db ${(stat.size / 1024).toFixed(1)} KB`;
            }),
            this.probe('memory', 'Memory', () => {
                const stat = fs.statSync(this.memoryJsonlPath);
                return `memory.jsonl ${(stat.size / 1024).toFixed(1)} KB`;
            }),
            this.probe('filesystem', 'Filesystem', () => {
                const entries = fs.readdirSync(this.agentDataDir);
                return `${entries.length} entries in agent-data/`;
            }),
            this.probe('vector-memory', 'Vector DB', () => {
                const stat = fs.statSync(this.vectorStorePath);
                return `chroma.sqlite3 ${(stat.size / 1024).toFixed(1)} KB`;
            }),
            this.probe('sequential-thinking', 'Seq. Thinking', () => `node ${process.version} available`),
        ];

        return {
            checked_at: new Date().toISOString(),
            mcps,
        };
    }
}
