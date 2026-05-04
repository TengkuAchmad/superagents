import { AnalyticsController } from '../controllers/analytics-controller';

export class AnalyticsRoutes {
    private readonly controller = new AnalyticsController();

    getSummary() {
        return this.controller.summary();
    }
}
