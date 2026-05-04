import { HealthController } from '../controllers/health-controller';

export class HealthRoutes {
    private readonly controller = new HealthController();

    async getStatus() {
        return this.controller.status();
    }
}
