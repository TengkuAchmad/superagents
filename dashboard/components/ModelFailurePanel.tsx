'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FailureStats {
  totalFailures: number;
  criticalFailures: number;
  escalatedFailures: number;
  unresolvedCritical: number;
  alertLevel: 'none' | 'yellow' | 'red';
}

interface FailureBreakdowns {
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  byModel: Record<string, number>;
}

interface FailureEvent {
  id: number;
  timestamp: string;
  agent_name: string;
  model_attempted: string;
  fallback_level: number;
  failure_type: string;
  severity: string;
  error_message: string;
  escalated_to_orchestrator: boolean;
  project_id: string;
  resolved_at: string | null;
  resolution_model: string | null;
}

interface ModelFailuresData {
  stats: FailureStats;
  breakdowns: FailureBreakdowns;
  recentCritical: FailureEvent[];
  recentAll: FailureEvent[];
  period: {
    hours: number;
    since: string;
    until: string;
  };
}

export default function ModelFailurePanel() {
  const [data, setData] = useState<ModelFailuresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFailures() {
      try {
        const res = await fetch('/api/model-failures?hours=24&limit=10');
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchFailures();
    const interval = setInterval(fetchFailures, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Failures</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Failures</CardTitle>
          <CardDescription className="text-red-500">Error: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) return null;

  const { stats, breakdowns, recentCritical } = data;

  const alertBadge = () => {
    switch (stats.alertLevel) {
      case 'red':
        return <Badge variant="destructive">🔴 RED ALERT - System-wide outage likely</Badge>;
      case 'yellow':
        return <Badge variant="warning">🟡 YELLOW ALERT - Critical failures detected</Badge>;
      default:
        return <Badge variant="success">🟢 All systems operational</Badge>;
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      {stats.alertLevel !== 'none' && (
        <Card className="border-red-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>⚠️ Model Provider Alert</CardTitle>
              {alertBadge()}
            </div>
            <CardDescription>
              {stats.unresolvedCritical} unresolved critical failure{stats.unresolvedCritical !== 1 ? 's' : ''}
              {' - '}All 5 fallback models exhausted for affected agents
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Statistics Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Model Failures (Last 24h)</CardTitle>
          <CardDescription>Provider health monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold">{stats.totalFailures}</div>
              <div className="text-sm text-muted-foreground">Total Failures</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{stats.criticalFailures}</div>
              <div className="text-sm text-muted-foreground">Critical</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-500">{stats.escalatedFailures}</div>
              <div className="text-sm text-muted-foreground">Escalated</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{stats.unresolvedCritical}</div>
              <div className="text-sm text-muted-foreground">Unresolved</div>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="mt-6 space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">By Failure Type</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breakdowns.byType).map(([type, count]) => (
                  <Badge key={type} variant="secondary">
                    {type.replace('_', ' ')}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">By Agent</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breakdowns.byAgent).map(([agent, count]) => (
                  <Badge key={agent} variant="secondary">
                    {agent}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">By Model</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breakdowns.byModel).map(([model, count]) => (
                  <Badge key={model} variant="secondary">
                    {model.split('/')[1]}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Critical Failures */}
      {recentCritical.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Critical Failures</CardTitle>
            <CardDescription>All fallbacks exhausted - orchestrator intervention required</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentCritical.map((failure) => (
                <div
                  key={failure.id}
                  className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-semibold">{failure.agent_name}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {formatTimestamp(failure.timestamp)}
                      </span>
                    </div>
                    {failure.escalated_to_orchestrator && (
                      <Badge variant="destructive" className="text-xs">ESCALATED</Badge>
                    )}
                  </div>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Model:</span> {failure.model_attempted}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>{' '}
                      <Badge variant="secondary" className="text-xs">
                        {failure.failure_type.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Level:</span> {failure.fallback_level}/4{' '}
                      {failure.fallback_level === 4 && '(FINAL FALLBACK)'}
                    </div>
                    {failure.error_message && (
                      <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-xs font-mono">
                        {failure.error_message.substring(0, 200)}
                        {failure.error_message.length > 200 && '...'}
                      </div>
                    )}
                    {failure.resolved_at && (
                      <div className="mt-2 text-green-600 dark:text-green-400">
                        ✓ Resolved at {formatTimestamp(failure.resolved_at)}
                        {failure.resolution_model && ` via ${failure.resolution_model}`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
