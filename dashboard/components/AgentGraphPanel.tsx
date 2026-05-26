'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  named_identity: string;
  role_label: string;
  role: string;
  status: string;
  action: string;
  description: string;
  count: number;
  last_seen: string;
  last_duration_ms: number | null;
  icon: string;
  color: string;
  model: string;
  fallback_models: string[];
  config_model: string | null;
  active_plan: { plan_id: string; title: string | null; pct: number; status: string | null } | null;
}

interface GraphEdge {
  source: string;
  target: string;
  action: string;
  count: number;
  status: string;
  route_type: 'delegate' | 'complete' | 'failed';
  avg_duration_ms: number | null;
  last_ts: string;
  /** When true, this edge represents a return flow (sub-agent → orchestrator)
   *  instead of a forward delegation. Rendered with a softer, dashed style. */
  is_return?: boolean;
}

interface StaticEdge { source: string; target: string }

interface RegistryNode {
  id: string;
  label: string;
  named_identity: string;
  role: string;
  icon: string;
  color: string;
  opencode_key: string;
  config_model: string | null;
  fallback_models: string[];
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  static_edges: StaticEdge[];
  registry: RegistryNode[];
  last_updated: string;
  total_actions: number;
  error?: string;
}

type AgentStatus = 'idle' | 'started' | 'completed' | 'failed';

type AgentNodeData = {
  identity: string;
  role: string;
  status: AgentStatus;
  action: string;
  description: string;
  count: number;
  color: string;
  icon: string;
  model: string;
  fallback_models: string[];
  active_plan: GraphNode['active_plan'];
  unknown: boolean;
} & Record<string, unknown>;

type AgentFlowNode = Node<AgentNodeData>;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AgentStatus, { border: string; bg: string; dot: string; badge: string }> = {
  started:   { border: '#27272a', bg: '#09090b', dot: '#60a5fa', badge: 'rgba(96,165,250,0.12)' },
  completed: { border: '#27272a', bg: '#09090b', dot: '#4ade80', badge: 'rgba(74,222,128,0.12)' },
  failed:    { border: '#27272a', bg: '#09090b', dot: '#f87171', badge: 'rgba(248,113,113,0.12)' },
  idle:      { border: '#27272a', bg: '#09090b', dot: '#71717a', badge: 'rgba(255,255,255,0.05)' },
};

const NODE_W = 188;
const NODE_H = 116;

// ── Dagre Layout ──────────────────────────────────────────────────────────────

function applyLayout(nodes: AgentFlowNode[], edges: Edge[]): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 110, nodesep: 80, marginx: 48, marginy: 48 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => { try { g.setEdge(e.source, e.target); } catch { /* skip */ } });
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 } };
    }),
    edges,
  };
}

// ── Progress Ring (SVG) ───────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 22, stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} className="agn-ring" aria-label={`${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#27272a" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 3} textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="monospace">
        {Math.round(pct)}
      </text>
    </svg>
  );
}

// ── Custom Node ───────────────────────────────────────────────────────────────

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const status: AgentStatus = (data.status as AgentStatus) ?? 'idle';
  const sc = STATUS_CFG[status];
  const isActive = status === 'started';
  const modelShort = (data.model as string || '').replace(/^(anthropic|github-copilot|opencode)\//, '');
  const fallbackTip = (data.fallback_models as string[])?.join('\n→ ') ?? '';

  return (
    <div
      className={`agn-card agn-card--${status}${isActive ? ' agn-running' : ''}`}
      style={{ borderColor: 'rgba(255,255,255,0.10)', background: sc.bg }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />

      {isActive && (
        <>
          <span className="agn-pulse" style={{ borderColor: sc.border }} />
          <span className="agn-pulse agn-pulse--delay" style={{ borderColor: sc.border }} />
        </>
      )}

      <div className="agn-header">
        <div className="agn-meta">
          <span className="agn-identity">{data.identity as string}</span>
          <span className="agn-role">{data.role as string}</span>
        </div>
        <div className="agn-header-right">
          {data.active_plan && (
            <ProgressRing pct={(data.active_plan as { pct: number }).pct} color={sc.dot} />
          )}
          <span className="agn-count" style={{ background: sc.badge, color: sc.dot }}>{data.count as number}</span>
        </div>
      </div>

      {modelShort && (
        <div className="agn-model" title={fallbackTip ? `Fallback chain:\n→ ${fallbackTip}` : undefined}>
          {modelShort}
        </div>
      )}

      <div className="agn-footer">
        <span className="agn-status-dot" style={{ background: sc.dot, opacity: 0.6 }} />
        <span className="agn-status-text" style={{ color: sc.dot, opacity: 0.6 }}>{status}</span>
        {data.action && status !== 'idle' && (
          <span className="agn-action">· {data.action as string}</span>
        )}
      </div>

      {data.description && status !== 'idle' && (
        <div className="agn-desc">{data.description as string}</div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

// ── Data Transform ────────────────────────────────────────────────────────────

interface BuildOpts {
  showStatic: boolean;
  hiddenAgents: Set<string>;
  statusFilter: 'all' | 'active' | 'failed';
}

function buildElements(data: GraphData, opts: BuildOpts): { nodes: AgentFlowNode[]; edges: Edge[] } {
  // Merge live nodes with registry (so static workflow can render even with empty DB)
  const byId = new Map<string, GraphNode>();
  for (const n of data.nodes) byId.set(n.id, n);
  if (opts.showStatic) {
    for (const r of data.registry) {
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id,
          label: r.label,
          named_identity: r.named_identity,
          role_label: r.label,
          role: r.role,
          status: 'idle',
          action: '',
          description: '',
          count: 0,
          last_seen: '',
          last_duration_ms: null,
          icon: r.icon,
          color: r.color,
          model: r.config_model ?? '',
          fallback_models: r.fallback_models,
          config_model: r.config_model,
          active_plan: null,
        });
      }
    }
  }

  const visible: GraphNode[] = [];
  for (const n of byId.values()) {
    if (opts.hiddenAgents.has(n.id)) continue;
    if (opts.statusFilter === 'active' && n.status !== 'started') continue;
    if (opts.statusFilter === 'failed' && n.status !== 'failed') continue;
    visible.push(n);
  }

  if (!visible.length) return { nodes: [], edges: [] };

  const rfNodes: AgentFlowNode[] = visible.map((n) => ({
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
    data: {
      identity: n.named_identity || n.label,
      role: n.role_label || n.role || 'Agent',
      status: (['idle', 'started', 'completed', 'failed'].includes(n.status) ? n.status : 'idle') as AgentStatus,
      action: n.action ?? '',
      description: n.description ?? '',
      count: n.count,
      color: n.color ?? '',
      icon: n.icon ?? '🤖',
      model: n.model ?? '',
      fallback_models: n.fallback_models ?? [],
      active_plan: n.active_plan,
      unknown: false,
    },
  }));

  const visibleIds = new Set(visible.map(n => n.id));

  // Edges glow ("animated" in ReactFlow terms) when EITHER:
  //   - currently in-flight (status=started), OR
  //   - touched within the last 10 minutes — keeps the path visually "warm"
  //     after a task finishes, so the viewer can still tell *where* the work
  //     just flowed (n8n-style trailing pulse).
  const RECENT_MS = 10 * 60 * 1000;
  const now = Date.now();
  const liveEdges: Edge[] = data.edges
    .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => {
      const isInFlight = e.status === 'started';
      const lastTs = e.last_ts ? new Date(e.last_ts.includes('T') ? e.last_ts : e.last_ts.replace(' ', 'T') + 'Z').getTime() : 0;
      const isRecent = lastTs > 0 && now - lastTs < RECENT_MS;
      const shouldGlow = isInFlight || isRecent;
      const isReturn = e.is_return === true;
      // Return edges use a softer emerald (work flowing back to orchestrator).
      const color =
        e.route_type === 'failed' ? '#ef4444' :
        isReturn ? '#10b981' :
        isInFlight ? '#6366f1' :
        isRecent ? '#818cf8' :       // softer indigo for recent-but-done
        e.route_type === 'complete' ? '#475569' : '#334155';
      const avg = e.avg_duration_ms ? ` · avg ${(e.avg_duration_ms / 1000).toFixed(1)}s` : '';
      const labelPrefix = isReturn ? '↩ ' : '';
      return {
        id: `live-${e.source}-${e.target}${isReturn ? '-ret' : ''}`,
        source: e.source,
        target: e.target,
        animated: shouldGlow,
        // Apply Safari-safe class for failed glow variant (separate keyframe).
        className: e.route_type === 'failed' ? 'agn-edge-failed' : undefined,
        label: `${labelPrefix}${e.count}×${avg}`,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        style: {
          stroke: color,
          // `color` drives the CSS `drop-shadow(... currentColor)` for the
          // inner crisp glow layers — works in Safari/Chrome/Firefox.
          color,
          // Return edges render thinner — they are confirmation flow, not
          // primary delegation. They still glow when recent so the viewer
          // sees the round-trip closing.
          strokeWidth: isReturn ? (shouldGlow ? 2 : 1) : isInFlight ? 3 : isRecent ? 2.2 : 1.5,
          // `'0'` instead of `'none'` because Safari ignores `none` here.
          // Failed gets a visible dash; return edges get a long-dash to
          // visually distinguish from forward delegation.
          strokeDasharray: e.route_type === 'failed'
            ? '4 3'
            : isReturn ? '6 6'
            : shouldGlow ? '0' : undefined,
        },
        labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(0,0,0,0.9)', rx: 3 },
        labelBgPadding: [4, 4] as [number, number],
        data: { tooltip: `${e.count} routes${avg}\nLast: ${e.last_ts}` },
      };
    });

  const staticEdges: Edge[] = opts.showStatic
    ? data.static_edges
        .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
        .filter(e => !liveEdges.find(le => le.source === e.source && le.target === e.target))
        .map((e) => ({
          id: `static-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          animated: false,
          style: { stroke: '#27272a', strokeWidth: 1, strokeDasharray: '2 4', opacity: 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#27272a', width: 12, height: 12 },
        }))
    : [];

  return applyLayout(rfNodes, [...staticEdges, ...liveEdges]);
}

// ── Inner panel (needs ReactFlowProvider) ─────────────────────────────────────

function GraphInner({
  projectFilter, taskId, sessionId, isFullscreen, setIsFullscreen,
  onNodeClick, inspectorOverlay, positionsVersion = 0, positionsScope = 'task',
}: {
  projectFilter: string;
  taskId: string | null;
  sessionId: string | null;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  onNodeClick?: (nodeId: string) => void;
  inspectorOverlay?: React.ReactNode;
  positionsVersion?: number;
  positionsScope?: 'task' | 'session';
}) {
  const [data, setData] = useState<GraphData | null>(null);
  const [nodes, setNodes] = useState<AgentFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [totalActions, setTotalActions] = useState(0);
  const [isEmpty, setIsEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [showStatic, setShowStatic] = useState(true);
  const [hiddenAgents, setHiddenAgents] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'failed'>('all');
  const flowRef = useRef<HTMLDivElement | null>(null);
  const { fitView } = useReactFlow();

  // Persisted per-task node positions. When a taskId is active, drag positions
  // are loaded from `/api/tasks/[id]` on mount and written back (debounced) on
  // drag stop, so a user's layout sticks across reloads.
  const userPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Positions API endpoint depends on the scope: 'task' or 'session'.
  // The parent picks which one matches its tab unit (one-task-per-tab in
  // legacy TaskWorkspace, one-session-per-tab in SessionWorkspace).
  const scopeId = positionsScope === 'session' ? sessionId : taskId;
  const scopeEndpoint = positionsScope === 'session' ? 'sessions' : 'tasks';

  useEffect(() => {
    userPositionsRef.current = new Map();
    if (!scopeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/${scopeEndpoint}/${encodeURIComponent(scopeId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { node_positions?: Array<{ node_id: string; x: number; y: number }> };
        if (cancelled) return;
        const m = new Map<string, { x: number; y: number }>();
        for (const p of data.node_positions ?? []) m.set(p.node_id, { x: p.x, y: p.y });
        userPositionsRef.current = m;
        setNodes((nds) => nds.map((n) => {
          const saved = m.get(n.id);
          return saved ? { ...n, position: saved } : n;
        }));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [scopeId, scopeEndpoint, positionsVersion]);

  const persistPositions = useCallback(() => {
    if (!scopeId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const positions = Array.from(userPositionsRef.current.entries())
        .map(([node_id, { x, y }]) => ({ node_id, x, y }));
      if (positions.length === 0) return;
      void fetch(`/api/${scopeEndpoint}/${encodeURIComponent(scopeId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positions }),
      }).catch(() => { /* best effort */ });
    }, 600);
  }, [scopeId, scopeEndpoint]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => setNodes((nds) => {
      const next = applyNodeChanges(changes, nds);
      // Capture finished drag positions for persistence.
      for (const ch of changes) {
        if (ch.type === 'position' && ch.dragging === false && ch.position) {
          userPositionsRef.current.set(ch.id, { x: ch.position.x, y: ch.position.y });
          persistPositions();
        }
      }
      return next;
    }),
    [persistPositions],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const opts = useMemo<BuildOpts>(
    () => ({ showStatic, hiddenAgents, statusFilter }),
    [showStatic, hiddenAgents, statusFilter],
  );

  const fetchGraph = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (taskId) params.set('task_id', taskId);
      else if (sessionId) params.set('session_id', sessionId);
      else if (projectFilter) params.set('project_id', projectFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/agent-graph${qs}`);
      const d: GraphData = await res.json();
      setData(d);
      setLastUpdated(new Date());
      setActiveCount(d.nodes.filter((nd) => nd.status === 'started').length);
      setTotalActions(d.total_actions);
      setIsEmpty(d.nodes.length === 0 && !showStatic);
      setIsLive(true);
      setError(d.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch error');
      setIsLive(false);
    }
  }, [projectFilter, taskId, sessionId, showStatic]);

  useEffect(() => {
    fetchGraph();
    const id = setInterval(fetchGraph, 2500);
    return () => clearInterval(id);
  }, [fetchGraph]);

  useEffect(() => {
    if (!data) return;
    const { nodes: n, edges: e } = buildElements(data, opts);
    // Preserve any positions the user has dragged for this task — otherwise
    // the 2.5s polling tick would snap nodes back to the auto-layout each frame.
    const saved = userPositionsRef.current;
    const withSaved = saved.size === 0
      ? n
      : n.map((node) => {
          const pos = saved.get(node.id);
          return pos ? { ...node, position: pos } : node;
        });
    setNodes(withSaved);
    setEdges(e);
  }, [data, opts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); setIsFullscreen(!isFullscreen); }
      else if (ev.key === 'r' || ev.key === 'R') { ev.preventDefault(); fetchGraph(); }
      else if (ev.key === 'Escape' && isFullscreen) { ev.preventDefault(); setIsFullscreen(false); }
      else if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); fitView({ padding: 0.25 }); }
      else if (ev.key === 's' || ev.key === 'S') { ev.preventDefault(); setShowStatic(v => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, setIsFullscreen, fetchGraph, fitView]);

  const exportPng = useCallback(async () => {
    if (!flowRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const viewport = flowRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
      const target = viewport ?? flowRef.current;
      const dataUrl = await toPng(target, {
        backgroundColor: '#09090b',
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `agent-graph-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
      setError('PNG export failed (check console)');
    }
  }, []);

  const miniMapNodeColor = useCallback(
    (n: Node) => STATUS_CFG[(n.data?.status as AgentStatus) ?? 'idle']?.dot ?? '#334155',
    [],
  );

  const allAgentIds = useMemo(() => {
    if (!data) return [] as RegistryNode[];
    const seen = new Set<string>();
    const out: RegistryNode[] = [];
    for (const r of data.registry) {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }
    for (const n of data.nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        out.push({
          id: n.id, label: n.label, named_identity: n.named_identity,
          role: n.role, icon: n.icon, color: n.color,
          opencode_key: '', config_model: n.config_model, fallback_models: n.fallback_models,
        });
      }
    }
    return out;
  }, [data]);

  const toggleAgent = (id: string) => {
    setHiddenAgents(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className={`agn-panel ${isFullscreen ? 'agn-panel--fullscreen' : ''}`}>
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
          <button className="agn-tbtn" onClick={() => setShowStatic(v => !v)} title="Toggle static workflow overlay (S)">
            {showStatic ? '⊕ static' : '⊖ static'}
          </button>
          <select
            className="agn-tbtn"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            title="Status filter"
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="failed">failed</option>
          </select>
          <button className="agn-tbtn" onClick={exportPng} title="Export PNG">⤓ png</button>
          <button className="agn-tbtn" onClick={() => fetchGraph()} title="Refresh (R)">↻</button>
          <button className="agn-tbtn" onClick={() => setIsFullscreen(!isFullscreen)} title="Fullscreen (F)">
            {isFullscreen ? '⤡ exit' : '⛶ full'}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      {allAgentIds.length > 0 && (
        <div className="agn-filter-bar">
          {allAgentIds.map(a => {
            const hidden = hiddenAgents.has(a.id);
            return (
              <button
                key={a.id}
                className={`agn-chip ${hidden ? 'agn-chip--off' : ''}`}
                onClick={() => toggleAgent(a.id)}
                style={{ borderColor: hidden ? '#27272a' : a.color }}
                title={`${a.named_identity} — ${a.label}`}
              >
                <span className="agn-chip-dot" style={{ background: a.color, opacity: hidden ? 0.3 : 1 }} />
                {a.named_identity}
              </button>
            );
          })}
        </div>
      )}

      {/* Canvas */}
      <div className="agn-canvas relative" ref={flowRef}>
        {inspectorOverlay}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick ? (_e, n) => onNodeClick(n.id) : undefined}
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
          <Background variant={BackgroundVariant.Dots} color="#1a1a1a" gap={24} size={1.2} />
          <Controls className="agn-controls" showInteractive={false} />
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(0,0,0,0.75)"
            style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid #27272a', borderRadius: 8 }}
            pannable zoomable
          />
          {isEmpty && (
            <Panel position="top-center">
              <div className="agn-empty">
                {error ? `⚠ ${error}` : 'No agent activity yet — run a task to see the graph populate. Press S to overlay workflow.'}
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
          <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke="#6366f1" strokeWidth="2" /></svg>
          <span className="agn-legend-label">active</span>
        </div>
        <div className="agn-legend-item">
          <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          <span className="agn-legend-label">failed</span>
        </div>
        <div className="agn-legend-item">
          <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke="#27272a" strokeWidth="1" strokeDasharray="2 4" /></svg>
          <span className="agn-legend-label">workflow</span>
        </div>
        <div className="agn-legend-item agn-legend-item--hint">
          <kbd>F</kbd> fullscreen · <kbd>S</kbd> static · <kbd>C</kbd> centre · <kbd>R</kbd> refresh
        </div>
      </div>
    </div>
  );
}

// ── Public panel (handles fullscreen portal + provider) ───────────────────────

export function AgentGraphPanel({
  projectFilter = '',
  taskId = null,
  sessionId = null,
  onNodeClick,
  inspectorOverlay,
  positionsVersion = 0,
  positionsScope = 'task',
}: {
  projectFilter?: string;
  taskId?: string | null;
  sessionId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  inspectorOverlay?: React.ReactNode;
  /** Bumping this value forces a re-fetch of saved node positions. */
  positionsVersion?: number;
  /** Whether saved positions live in /api/tasks or /api/sessions. */
  positionsScope?: 'task' | 'session';
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const content = (
    <ReactFlowProvider>
      <GraphInner
        projectFilter={projectFilter}
        taskId={taskId}
        sessionId={sessionId}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        onNodeClick={onNodeClick}
        inspectorOverlay={inspectorOverlay}
        positionsVersion={positionsVersion}
        positionsScope={positionsScope}
      />
    </ReactFlowProvider>
  );

  if (isFullscreen && mounted) {
    return createPortal(
      <div className="agn-fullscreen-overlay">{content}</div>,
      document.body,
    );
  }
  return content;
}
