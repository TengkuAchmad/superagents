import { NextResponse } from 'next/server';
import { HealthCheckTool, type MCPHealthResponse } from '../../../../tools/health-check';

const healthCheckTool = new HealthCheckTool();

export async function GET() {
  const result = await healthCheckTool.probeAll();
  return NextResponse.json<MCPHealthResponse>(result);
}
