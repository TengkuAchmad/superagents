/**
 * Model Failure Sensor
 * 
 * Monitors model provider health and detects failures across the 5-tier fallback chain.
 * Escalates to orchestrator when all fallbacks are exhausted.
 * 
 * @module agent/core/model-failure-sensor
 */

import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config',
  'opencode',
  'agent-data',
  'agent.db'
);

/**
 * Failure severity levels
 */
export enum FailureSeverity {
  /** Single model failed, fallback succeeded */
  LOW = 'low',
  /** Multiple fallbacks attempted, still working */
  MEDIUM = 'medium',
  /** All fallbacks exhausted, must escalate */
  CRITICAL = 'critical'
}

/**
 * Model failure types
 */
export enum FailureType {
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  SERVICE_OUTAGE = 'service_outage',
  AUTH_FAILURE = 'auth_failure',
  NETWORK_TIMEOUT = 'network_timeout',
  MODEL_UNAVAILABLE = 'model_unavailable',
  UNKNOWN = 'unknown'
}

/**
 * Failure event record
 */
export interface FailureEvent {
  id?: number;
  timestamp: string;
  agent_name: string;
  model_attempted: string;
  fallback_level: number;
  failure_type: FailureType;
  severity: FailureSeverity;
  error_message: string;
  escalated_to_orchestrator: boolean;
  project_id: string;
}

/**
 * Failure detection result
 */
export interface FailureDetectionResult {
  failed: boolean;
  failureType: FailureType;
  shouldEscalate: boolean;
  severity: FailureSeverity;
  fallbackLevel: number;
  message: string;
}

/**
 * Model Failure Sensor
 * 
 * Detects model failures, tracks fallback attempts, and escalates to orchestrator
 * when all fallbacks are exhausted.
 */
export class ModelFailureSensor {
  private db: Database.Database;
  
  constructor() {
    this.db = new Database(DB_PATH);
    this.initSchema();
  }

  /**
   * Initialize failure tracking schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        agent_name TEXT NOT NULL,
        model_attempted TEXT NOT NULL,
        fallback_level INTEGER NOT NULL,
        failure_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        error_message TEXT,
        escalated_to_orchestrator BOOLEAN DEFAULT 0,
        project_id TEXT,
        resolved_at DATETIME,
        resolution_model TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_model_failures_agent ON model_failures(agent_name, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_model_failures_severity ON model_failures(severity, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_model_failures_escalated ON model_failures(escalated_to_orchestrator, timestamp DESC);
    `);
  }

  /**
   * Detect and classify a model failure
   * 
   * @param error Error object or message from model call
   * @param agentName Name of the agent experiencing the failure
   * @param modelAttempted The model that failed
   * @param fallbackLevel Which fallback tier (0=primary, 1-4=fallbacks)
   * @param projectId Project identifier
   * @returns Detection result with escalation recommendation
   */
  public detectFailure(
    error: Error | string,
    agentName: string,
    modelAttempted: string,
    fallbackLevel: number,
    projectId: string
  ): FailureDetectionResult {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const failureType = this.classifyFailure(errorMessage);
    
    // Determine severity based on fallback level
    let severity: FailureSeverity;
    let shouldEscalate: boolean;
    
    if (fallbackLevel >= 4) {
      // Final fallback (opencode free tier) failed - CRITICAL
      severity = FailureSeverity.CRITICAL;
      shouldEscalate = true;
    } else if (fallbackLevel >= 2) {
      // Multiple fallbacks attempted - MEDIUM
      severity = FailureSeverity.MEDIUM;
      shouldEscalate = false;
    } else {
      // Single failure, fallbacks available - LOW
      severity = FailureSeverity.LOW;
      shouldEscalate = false;
    }

    // Log the failure
    this.logFailure({
      timestamp: new Date().toISOString(),
      agent_name: agentName,
      model_attempted: modelAttempted,
      fallback_level: fallbackLevel,
      failure_type: failureType,
      severity,
      error_message: errorMessage,
      escalated_to_orchestrator: shouldEscalate,
      project_id: projectId
    });

    return {
      failed: true,
      failureType,
      shouldEscalate,
      severity,
      fallbackLevel,
      message: this.buildFailureMessage(agentName, modelAttempted, failureType, severity, shouldEscalate)
    };
  }

  /**
   * Classify failure type based on error message
   */
  private classifyFailure(errorMessage: string): FailureType {
    const msg = errorMessage.toLowerCase();
    
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return FailureType.RATE_LIMIT;
    }
    if (msg.includes('quota') || msg.includes('insufficient credits')) {
      return FailureType.QUOTA_EXCEEDED;
    }
    if (msg.includes('service unavailable') || msg.includes('502') || msg.includes('503')) {
      return FailureType.SERVICE_OUTAGE;
    }
    if (msg.includes('unauthorized') || msg.includes('authentication') || msg.includes('401')) {
      return FailureType.AUTH_FAILURE;
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return FailureType.NETWORK_TIMEOUT;
    }
    if (msg.includes('model not found') || msg.includes('model unavailable')) {
      return FailureType.MODEL_UNAVAILABLE;
    }
    
    return FailureType.UNKNOWN;
  }

  /**
   * Log failure event to database
   */
  private logFailure(event: FailureEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO model_failures (
        timestamp, agent_name, model_attempted, fallback_level,
        failure_type, severity, error_message, escalated_to_orchestrator, project_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.timestamp,
      event.agent_name,
      event.model_attempted,
      event.fallback_level,
      event.failure_type,
      event.severity,
      event.error_message,
      event.escalated_to_orchestrator ? 1 : 0,
      event.project_id
    );
  }

  /**
   * Mark a failure as resolved
   */
  public markResolved(failureId: number, resolutionModel: string): void {
    const stmt = this.db.prepare(`
      UPDATE model_failures
      SET resolved_at = CURRENT_TIMESTAMP, resolution_model = ?
      WHERE id = ?
    `);
    stmt.run(resolutionModel, failureId);
  }

  /**
   * Get recent failures for an agent
   */
  public getRecentFailures(agentName: string, limit = 10): FailureEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM model_failures
      WHERE agent_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(agentName, limit) as FailureEvent[];
  }

  /**
   * Get all unresolved critical failures
   */
  public getCriticalFailures(): FailureEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM model_failures
      WHERE severity = 'critical' AND resolved_at IS NULL
      ORDER BY timestamp DESC
    `);
    return stmt.all() as FailureEvent[];
  }

  /**
   * Get failure statistics for the dashboard
   */
  public getFailureStats(hours = 24): {
    totalFailures: number;
    criticalFailures: number;
    escalatedFailures: number;
    failuresByType: Record<string, number>;
    failuresByAgent: Record<string, number>;
  } {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM model_failures WHERE timestamp > ?
    `).get(since) as { count: number };

    const critical = this.db.prepare(`
      SELECT COUNT(*) as count FROM model_failures WHERE timestamp > ? AND severity = 'critical'
    `).get(since) as { count: number };

    const escalated = this.db.prepare(`
      SELECT COUNT(*) as count FROM model_failures WHERE timestamp > ? AND escalated_to_orchestrator = 1
    `).get(since) as { count: number };

    const byType = this.db.prepare(`
      SELECT failure_type, COUNT(*) as count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY failure_type
    `).all(since) as Array<{ failure_type: string; count: number }>;

    const byAgent = this.db.prepare(`
      SELECT agent_name, COUNT(*) as count
      FROM model_failures
      WHERE timestamp > ?
      GROUP BY agent_name
    `).all(since) as Array<{ agent_name: string; count: number }>;

    return {
      totalFailures: total.count,
      criticalFailures: critical.count,
      escalatedFailures: escalated.count,
      failuresByType: Object.fromEntries(byType.map(r => [r.failure_type, r.count])),
      failuresByAgent: Object.fromEntries(byAgent.map(r => [r.agent_name, r.count]))
    };
  }

  /**
   * Build human-readable failure message
   */
  private buildFailureMessage(
    agentName: string,
    model: string,
    failureType: FailureType,
    severity: FailureSeverity,
    shouldEscalate: boolean
  ): string {
    const typeMessages: Record<FailureType, string> = {
      [FailureType.RATE_LIMIT]: 'Rate limit exceeded',
      [FailureType.QUOTA_EXCEEDED]: 'Quota exhausted',
      [FailureType.SERVICE_OUTAGE]: 'Service unavailable',
      [FailureType.AUTH_FAILURE]: 'Authentication failed',
      [FailureType.NETWORK_TIMEOUT]: 'Network timeout',
      [FailureType.MODEL_UNAVAILABLE]: 'Model not available',
      [FailureType.UNKNOWN]: 'Unknown error'
    };

    let message = `[${agentName}] ${typeMessages[failureType]} - ${model} failed`;
    
    if (shouldEscalate) {
      message += ' | ⚠️ ALL FALLBACKS EXHAUSTED - ESCALATING TO ORCHESTRATOR';
    } else if (severity === FailureSeverity.MEDIUM) {
      message += ' | Attempting next fallback...';
    } else {
      message += ' | Falling back to next model';
    }

    return message;
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}

/**
 * Singleton instance for global access
 */
let sensorInstance: ModelFailureSensor | null = null;

/**
 * Get or create the failure sensor instance
 */
export function getFailureSensor(): ModelFailureSensor {
  if (!sensorInstance) {
    sensorInstance = new ModelFailureSensor();
  }
  return sensorInstance;
}

/**
 * Escalation protocol for orchestrator
 * 
 * Called when all model fallbacks are exhausted for an agent.
 * The orchestrator must handle this by either:
 * 1. Retrying with a different agent
 * 2. Degrading gracefully (partial response)
 * 3. Reporting failure to user with actionable guidance
 */
export interface EscalationPayload {
  agentName: string;
  taskDescription: string;
  failureChain: Array<{
    model: string;
    failureType: FailureType;
    errorMessage: string;
  }>;
  projectId: string;
  timestamp: string;
}

/**
 * Build escalation payload for orchestrator
 */
export function buildEscalationPayload(
  agentName: string,
  taskDescription: string,
  recentFailures: FailureEvent[],
  projectId: string
): EscalationPayload {
  return {
    agentName,
    taskDescription,
    failureChain: recentFailures.map(f => ({
      model: f.model_attempted,
      failureType: f.failure_type,
      errorMessage: f.error_message
    })),
    projectId,
    timestamp: new Date().toISOString()
  };
}
