import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import {
  buildEnterpriseKnowledgeGraph,
  GraphNodeKind,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '../lib/knowledge-graph.ts';
import { MOCK_ASSETS } from '../lib/mock-data.ts';
import { HybridSearchResult, SecurityClearanceLevel } from '../lib/types.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface KnowledgeGraphD3Props {
  activeResults: HybridSearchResult[];
  userClearance: SecurityClearanceLevel;
}

interface SimNode extends d3.SimulationNodeDatum, KnowledgeGraphNode {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  relation: KnowledgeGraphEdge['relation'];
  isOnActivePath: boolean;
}

const NODE_COLORS: Record<
  GraphNodeKind,
  { fill: string; stroke: string; label: string; tagBg: string }
> = {
  vendor: {
    fill: '#4f46e5',
    stroke: '#818cf8',
    label: 'Vendor',
    tagBg: 'text-indigo-700 dark:text-indigo-300',
  },
  asset: {
    fill: '#0284c7',
    stroke: '#38bdf8',
    label: 'Asset',
    tagBg: 'text-sky-700 dark:text-sky-300',
  },
  business_unit: {
    fill: '#d97706',
    stroke: '#fbbf24',
    label: 'Business Unit',
    tagBg: 'text-amber-700 dark:text-amber-300',
  },
  incident: {
    fill: '#e11d48',
    stroke: '#fb7185',
    label: 'Incident',
    tagBg: 'text-rose-700 dark:text-rose-300',
  },
};

const SVG_WIDTH = 780;
const SVG_HEIGHT = 400;

export const KnowledgeGraphD3: React.FC<KnowledgeGraphD3Props> = ({
  activeResults,
  userClearance,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const topAssetId = activeResults[0]?.asset.id || MOCK_ASSETS[0].id;
  const [sourceAssetId, setSourceAssetId] = useState<string>(topAssetId);
  const [targetAssetId, setTargetAssetId] = useState<string>('__query_chain__');
  const [selectedNodeId, setSelectedNodeId] = useState<string>(`asset:${topAssetId}`);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Sync default source asset when top search result changes unless user is inspecting a custom pair
  useEffect(() => {
    setSourceAssetId(topAssetId);
    setSelectedNodeId(`asset:${topAssetId}`);
  }, [topAssetId]);

  const graphData = useMemo(() => {
    return buildEnterpriseKnowledgeGraph({
      activeResults,
      userClearance,
      sourceAssetId,
      targetAssetId: targetAssetId === '__query_chain__' ? undefined : targetAssetId,
    });
  }, [activeResults, userClearance, sourceAssetId, targetAssetId]);

  const selectedNode = useMemo(() => {
    return (
      graphData.nodes.find((n) => n.id === selectedNodeId) ||
      graphData.nodes.find((n) => n.id === `asset:${sourceAssetId}`) ||
      graphData.nodes[0]
    );
  }, [graphData.nodes, selectedNodeId, sourceAssetId]);

  // Render D3 force-directed graph inside SVG
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const kindXTargets: Record<GraphNodeKind, number> = {
      vendor: 95,
      asset: 290,
      business_unit: 500,
      incident: 685,
    };

    const usableTop = 44;
    const usableBottom = SVG_HEIGHT - 54;
    const usableSpan = usableBottom - usableTop;

    const targetYById = new Map<string, number>();
    const simNodes: SimNode[] = graphData.nodes.map((n) => {
      const sameKind = graphData.nodes.filter((item) => item.kind === n.kind);
      const idxInKind = sameKind.findIndex((item) => item.id === n.id);
      const targetY =
        sameKind.length <= 1
          ? SVG_HEIGHT / 2
          : usableTop + (usableSpan * idxInKind) / (sameKind.length - 1);
      targetYById.set(n.id, targetY);
      return {
        ...n,
        x: kindXTargets[n.kind],
        y: targetY,
      };
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = graphData.edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        id: e.id,
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
        relation: e.relation,
        isOnActivePath: e.isOnActivePath,
      }));

    // Palette tokens calibrated for WCAG contrast in Light & Dark modes
    const edgeDefaultStroke = isDark ? '#334155' : '#cbd5e1';
    const edgeActiveStroke = isDark ? '#818cf8' : '#4f46e5';
    const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#475569';
    const haloBg = isDark ? '#020617' : '#ffffff';

    const defs = svg.append('defs');

    defs
      .append('marker')
      .attr('id', 'arrow-default')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 23)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', edgeDefaultStroke);

    defs
      .append('marker')
      .attr('id', 'arrow-active')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', edgeActiveStroke);

    const viewport = svg.append('g').attr('class', 'd3-viewport');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2.5])
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform.toString());
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(155)
          .strength(0.2)
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('x', d3.forceX<SimNode>((d) => kindXTargets[d.kind]).strength(0.75))
      .force(
        'y',
        d3.forceY<SimNode>((d) => targetYById.get(d.id) ?? SVG_HEIGHT / 2).strength(0.65)
      )
      .force('collision', d3.forceCollide<SimNode>(44));

    // Pre-tick simulation so initial render opens already settled cleanly
    for (let i = 0; i < 90; i++) {
      simulation.tick();
    }

    // Clamp nodes comfortably inside viewport bounds
    for (const node of simNodes) {
      node.x = Math.max(68, Math.min(SVG_WIDTH - 68, node.x ?? SVG_WIDTH / 2));
      node.y = Math.max(36, Math.min(SVG_HEIGHT - 44, node.y ?? SVG_HEIGHT / 2));
    }

    // Edges
    const linkGroup = viewport
      .append('g')
      .attr('class', 'links')
      .selectAll('g')
      .data(simLinks)
      .enter()
      .append('g');

    const linkLines = linkGroup
      .append('line')
      .attr('stroke', (d) => (d.isOnActivePath ? edgeActiveStroke : edgeDefaultStroke))
      .attr('stroke-width', (d) => (d.isOnActivePath ? 2.5 : 1.3))
      .attr('stroke-opacity', (d) => (d.isOnActivePath ? 0.95 : 0.65))
      .attr('marker-end', (d) => (d.isOnActivePath ? 'url(#arrow-active)' : 'url(#arrow-default)'));

    const linkLabels = linkGroup
      .append('text')
      .text((d) => (d.isOnActivePath ? d.relation : ''))
      .attr('font-size', '8.5px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('font-weight', '600')
      .attr('text-anchor', 'middle')
      .attr('fill', edgeActiveStroke)
      .attr('paint-order', 'stroke')
      .attr('stroke', haloBg)
      .attr('stroke-width', 4);

    // Nodes
    const nodeGroups = viewport
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('class', 'cursor-pointer')
      .attr('data-node-id', (d) => d.id)
      .on('click', (event, d) => {
        if (event.defaultPrevented) return;
        setSelectedNodeId(d.id);
      });

    // Outer highlight ring for active traversal path nodes
    nodeGroups
      .filter((d) => d.isOnActivePath)
      .append('circle')
      .attr('r', 21)
      .attr('fill', 'none')
      .attr('stroke', edgeActiveStroke)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d) => (d.isPrimaryMatch ? 'none' : '4 2'));

    // Main node circle
    nodeGroups
      .append('circle')
      .attr('class', 'node-core-circle')
      .attr('r', (d) => (d.kind === 'asset' ? 16 : 14))
      .attr('fill', (d) => NODE_COLORS[d.kind].fill)
      .attr('fill-opacity', (d) => (d.isOnActivePath ? 1 : 0.72))
      .attr('stroke', (d) => NODE_COLORS[d.kind].stroke)
      .attr('stroke-width', 1.5);

    // Kind abbreviation inside node circle
    nodeGroups
      .append('text')
      .text((d) => {
        if (d.kind === 'vendor') return 'V';
        if (d.kind === 'asset') return 'A';
        if (d.kind === 'business_unit') return 'BU';
        return '!';
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none');

    // Node caption label below circle
    nodeGroups
      .append('text')
      .text((d) => d.shortLabel)
      .attr('text-anchor', 'middle')
      .attr('y', (d) => (d.kind === 'asset' ? 30 : 28))
      .attr('font-size', '10.5px')
      .attr('font-weight', (d) => (d.isOnActivePath ? '600' : '500'))
      .attr('fill', (d) => (d.isOnActivePath ? textPrimary : textMuted))
      .attr('paint-order', 'stroke')
      .attr('stroke', haloBg)
      .attr('stroke-width', 3.5)
      .attr('pointer-events', 'none');

    // Native SVG title for accessibility & quick hover inspection
    nodeGroups.append('title').text((d) => `${NODE_COLORS[d.kind].label}: ${d.label}\n${d.subtitle}`);

    const updatePositions = () => {
      linkLines
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      linkLabels
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 5);

      nodeGroups.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    updatePositions();

    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeGroups.call(dragBehavior);
    simulation.on('tick', updatePositions);
    simulation.alpha(0.05).stop();

    return () => {
      simulation.stop();
    };
  }, [graphData, isDark]);

  // Highlight currently selected node without resetting zoom or dragged coordinates
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const textPrimary = isDark ? '#f1f5f9' : '#0f172a';

    d3.select(svgEl)
      .selectAll<SVGGElement, SimNode>('g[data-node-id]')
      .select<SVGCircleElement>('circle.node-core-circle')
      .attr('stroke', (d) => (d.id === selectedNodeId ? textPrimary : NODE_COLORS[d.kind].stroke))
      .attr('stroke-width', (d) => (d.id === selectedNodeId ? 2.75 : 1.5));
  }, [selectedNodeId, graphData, isDark]);

  const handleZoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(180)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(200)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  return (
    <div
      role="region"
      aria-label="Interactive Multi-Hop Knowledge Graph Visualization"
      className="space-y-4"
    >
      {/* Controls & Multi-Hop Asset-to-Asset Path Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div className="space-y-1">
            <label
              htmlFor="graph-source-asset"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Source Asset
            </label>
            <select
              id="graph-source-asset"
              value={sourceAssetId}
              onChange={(e) => {
                setSourceAssetId(e.target.value);
                setSelectedNodeId(`asset:${e.target.value}`);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {MOCK_ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.region})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="graph-target-asset"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Traversal Target (Multi-Hop Path)
            </label>
            <select
              id="graph-target-asset"
              value={targetAssetId}
              onChange={(e) => setTargetAssetId(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="__query_chain__">Active 4-Node Chain (Vendor → Asset → BU → Incident)</option>
              {MOCK_ASSETS.filter((a) => a.id !== sourceAssetId).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  Traverse to: {asset.name} ({asset.region})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Zoom Toolbar */}
        <div className="flex items-center gap-1 self-start sm:self-end shrink-0">
          <button
            type="button"
            onClick={() => handleZoomBy(1.25)}
            aria-label="Zoom in knowledge graph"
            title="Zoom in"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoomBy(0.8)}
            aria-label="Zoom out knowledge graph"
            title="Zoom out"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset knowledge graph view"
            title="Reset zoom"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* D3 Interactive Force-Directed SVG Canvas */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Legend Bar */}
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              Vendor
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
              Asset
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
              Business Unit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              Incident
            </span>
          </div>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Drag nodes or scroll to zoom · {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>

        <svg
          ref={svgRef}
          data-testid="d3-knowledge-graph-svg"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-[340px] sm:h-[360px] select-none cursor-grab active:cursor-grabbing block"
        />
      </div>

      {/* Multi-Hop Traversal Path Breadcrumb */}
      <div
        data-testid="graph-traversal-path"
        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              {graphData.mode === 'asset_to_asset'
                ? 'Discovered Cross-Asset Traversal Path'
                : 'Active 4-Node Dependency Chain'}
            </span>
          </span>
          <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-400 tabular-nums">
            {graphData.activePath.found
              ? `${graphData.activePath.hops} ${graphData.activePath.hops === 1 ? 'hop' : 'hops'}`
              : 'No path found'}
          </span>
        </div>

        {graphData.activePath.found ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {graphData.activePath.steps.map((step, idx) => (
              <React.Fragment key={`${step.nodeId}-${idx}`}>
                {idx > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-indigo-700 dark:text-indigo-400">
                    <ArrowRight className="w-3 h-3" />
                    {step.viaRelation && <span>{step.viaRelation}</span>}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(step.nodeId)}
                  className={`px-2 py-1 rounded-md border text-xs transition-colors ${
                    selectedNodeId === step.nodeId
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 text-slate-900 dark:text-white font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span className={`font-mono text-[10px] mr-1 ${NODE_COLORS[step.kind].tagBg}`}>
                    {NODE_COLORS[step.kind].label}:
                  </span>
                  <span>{step.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No connected path exists between these assets under current clearance ({userClearance}).
          </p>
        )}
      </div>

      {/* Selected Node Metadata Readout */}
      {selectedNode && (
        <div
          data-testid="graph-selected-node-details"
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-mono font-semibold ${NODE_COLORS[selectedNode.kind].tagBg}`}>
              {NODE_COLORS[selectedNode.kind].label}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {selectedNode.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            {Object.entries(selectedNode.details).map(([key, val]) => (
              <span key={key}>
                {key}: <strong className="text-slate-800 dark:text-slate-200">{String(val)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
