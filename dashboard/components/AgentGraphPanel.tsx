'use client';

import { useEffect, useCallback, useState } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
  BackgroundVariant,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  role: string;
  status: string;
  action: string;
  count: number;
  last_seen: string;
}

interface GraphEdge {
  source: string;
  target: string;
  action: string;
  count: number;
  status: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  last_updated: string;
  total_actions: number;
  error?: string;
}

type AgentStatus = 'idle' | 'started' | 'completed' | 'failed';

type AgentNodeData = {
  label: string;
  role: string;
  status: AgentStatus;
  action: string;
  count: number;
  color: string;
  icon: string;
} & Record<string, unknown>;

type AgentFlowNode = Node<AgentNodeData>;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AgentStatus, { border: string; bg: string; glow: string; dot: string; badge: string }> = {
  started:   { border: '#6366f1', bg: 'rgba(99,102,241,0.10)',  glow: '0 0 22px rgba(99,102,241,0.45)',  dot: '#818cf8', badge: '#4f46e5' },
  completed: { border: '#10b981', bg: 'rgba(16,185,129,0.08)',  glow: '0 0 14px rgba(16,185,129,0.30)',  dot: '#34d399', badge: '#059669' },
  failed:    { border: '#ef4444', bg: 'rgba(239,68,68,0.08)',   glow: '0 0 22px rgba(239,68,68,0.40)',   dot: '#f87171', badge: '#dc2626' },
  idle:      { border: '#1e293b', bg: 'rgba(15,23,42,0.60)',    glow: 'none',                            dot: '#475569', badge: '#334155' },
};

const NODE_W = 168;
const NODE_H = 96;

// ── Dagre Layout ──────────────────────────────────────────────────────────────

function applyLayout(nodes: AgentFlowNode[], edges: Edge[]): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 72, marginx: 48, marginy: 48 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => { try { g.setEdge(e.source, e.target); } catch { /* skip invalid */ } });
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 } };
    }),
    edges,
  };
}

// ── Custom Node ───────────────────────────────────────────────────────────────

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const status: AgentStatus = (data.status as AgentStatus) ?? 'idle';
  const sc = STATUS_CFG[status];
  const isActive = status === 'started';
  const isFailed = status === 'failed';
  // Icon and color come from the API (registry-driven), fallback to status color
  const nodeColor = (data.color as string) || sc.border;

  return (
    <div
      className={`agn-card agn-card--${status}`}
      style={{ borderColor: nodeColor, background: sc.bg, boxShadow: `0 0 18px ${sc.glow.replace(sc.border, nodeColor)}` }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />

      {isActive && (
        <>
          <span className="agn-pulse" style={{ borderColor: nodeColor }} />
          <span className="agn-pulse agn-pulse--delay" style={{ borderColor: nodeColor }} />
        </>
      )}

      <div className="agn-header">
        <span className="agn-icon">{(data.icon as string) || '🤖'}</span>
        <div className="agn-meta">
          <span className="agn-name" style={{ color: isActive ? '#c7d2fe' : isFailed ? '#fca5a5' : '#e2e8f0' }}>
            {data.label as string}
          </span>
          <span className="agn-role">{data.role as string}</span>
        </div>
        <span className="agn-count" style={{ background: sc.badge }}>{data.count as number}</span>
      </div>

      <div className="agn-footer">
        <span className="agn-status-dot" style={{ background: sc.dot }} />
        <span className="agn-status-text">{status}</span>
        {data.action && status !== 'idle' && (
          <span className="agn-action">· {data.action as string}</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

// ── Data Transform ────────────────────────────────────────────────────────────

function buildElements(data: GraphData): { nodes: AgentFlowNode[]; edges: Edge[] } {
  if (!data.nodes.length) return { nodes: [], edges: [] };

  const rfNodes: AgentFlowNode[] = data.nodes.map((n) => ({
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      role: n.role,
      status: (['idle', 'started', 'completed', 'failed'].includes(n.status)
        ? n.status : 'idle') as AgentStatus,
      action: n.action ?? '',
      count: n.count,
      color: (n as { color?: string }).color ?? '',
      icon: (n as { icon?: string }).icon ?? '🤖',
    },
  }));

  const rfEdges: Edge[] = data.edges.map((e) => {
    const isActive = e.status === 'started';
    const isFailed = e.status === 'failed';
    const color = isActive ? '#6366f1' : isFailed ? '#ef4444' : '#334155';
    return {
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      animated: isActive,
      label: e.count > 1 ? `${e.count}×` : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: isActive ? 2.5 : 1.5 },
      labelStyle: { fill: '#64748b', fontSize: 10, fontFamily: 'monospace' },
      labelBgStyle: { fill: 'rgba(10,14,28,0.85)', rx: 3 },
      labelBgPadding: [4, 4] as [number, number],
    };
  });

  return applyLayout(rfNodes, rfEdges);
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function AgentGraphPanel({ projectFilter = '' }: { projectFilter?: string }) {
  const [nodes, setNodes] = useState<AgentFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [totalActions, setTotalActions] = useState(0);
  const [isEmpty, setIsEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const fetchGraph = useCallback(async () => {
    try {
      const qs = projectFilter ? `?project_id=${projectFilter}` : '';
      const res = await fetch(`/api/agent-graph${qs}`);
      const data: GraphData = await res.json();
      const { nodes: n, edges: e } = buildElements(data);
      setNodes(n);
      setEdges(e);
      setLastUpdated(new Date());
      setActiveCount(data.nodes.filter((nd) => nd.status === 'started').length);
      setTotalActions(data.total_actions);
      setIsEmpty(data.nodes.length === 0);
      setIsLive(true);
      setError(data.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch error');
      setIsLive(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    fetchGraph();
    const id = setInterval(fetchGraph, 2500);
    return () => clearInterval(id);
  }, [fetchGraph]);

  const miniMapNodeColor = useCallback(
    (n: Node) => STATUS_CFG[(n.data?.status as AgentStatus) ?? 'idle']?.dot ?? '#334155',
    [],
  );

  return (
    <div className="agn-panel">
      {/* Header */}
      <div className="agn-panel-header">
        <div className="agn-panel-title">
          <span className={`agn-live-dot ${isLive ? 'agn-live-dot--on' : ''}`} />
          Agent Activity Graph
          {activeCount > 0 && <span className="agn-badge-active">{activeCount} active</span>}
        </div>
        <div className="agn-panel-stats">
          <span className="agn-stat">{totalActions} actions</span>
          {lastUpdated && (
            <span className="agn-stat agn-stat--time">
              {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {error && <span className="agn-stat agn-stat--error">⚠ {error}</span>}
        </div>
      </div>

      {/* Canvas */}
      <div className="agn-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={3}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={24} size={1.2} />
          <Controls className="agn-controls" showInteractive={false} />
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(0,0,0,0.75)"
            style={{ background: 'rgba(8,12,24,0.92)', border: '1px solid #1e293b', borderRadius: 8 }}
            pannable
            zoomable
          />
          {isEmpty && (
            <Panel position="top-center">
              <div className="agn-empty">
                {error
                  ? `⚠ ${error}`
                  : 'No agent activity yet — run a task to see the graph populate in real time'}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="agn-legend">
        {(Object.entries(STATUS_CFG) as [AgentStatus, typeof STATUS_CFG[AgentStatus]][]).map(([status, cfg]) => (
          <div key={status} className="agn-legend-item">
            <span className="agn-legend-dot" style={{ background: cfg.dot }} />
            <span className="agn-legend-label">{status}</span>
          </div>
        ))}
        <div className="agn-legend-item">
          <svg width="28" height="10" style={{ flex: 'none' }}>
            <line x1="0" y1="5" x2="28" y2="5" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 2" />
          </svg>
          <span className="agn-legend-label">active route</span>
        </div>
        <div className="agn-legend-item">
          <svg width="28" height="10" style={{ flex: 'none' }}>
            <line x1="0" y1="5" x2="28" y2="5" stroke="#334155" strokeWidth="1.5" />
          </svg>
          <span className="agn-legend-label">completed route</span>
        </div>
      </div>
    </div>
  );
}
