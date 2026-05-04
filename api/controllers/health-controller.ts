import { HealthCheckTool } from '../../tools/health-check';

export class HealthController {
    private readonly tool = new HealthCheckTool();

    async status() {
        return this.tool.probeAll();
    }
}
