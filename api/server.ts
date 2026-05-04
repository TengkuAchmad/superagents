import { AgentRoutes } from './routes/agent-routes';
import { AnalyticsRoutes } from './routes/analytics-routes';
import { HealthRoutes } from './routes/health-routes';

export class AgentApiServer {
    readonly agent = new AgentRoutes();
    readonly analytics = new AnalyticsRoutes();
    readonly health = new HealthRoutes();
}
