import React, { useState } from 'react';
import { GitFork, ShieldAlert, Database, Layers, CheckCircle, HelpCircle } from 'lucide-react';
import { MOCK_VENDORS, MOCK_ASSETS, MOCK_BUSINESS_UNITS, MOCK_INCIDENTS } from '../lib/mock-data.ts';

export const GraphExplorer: React.FC = () => {
  const [selectedAssetId, setSelectedAssetId] = useState<string>('ast-rds-01');

  const currentAsset = MOCK_ASSETS.find(a => a.id === selectedAssetId) || MOCK_ASSETS[0];
  const currentVendor = MOCK_VENDORS.find(v => v.id === currentAsset.vendor_id)!;
  const currentBU = MOCK_BUSINESS_UNITS.find(b => b.id === currentAsset.business_unit_id)!;
  const currentIncident = MOCK_INCIDENTS.find(i => i.asset_id === currentAsset.id);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-purple-400 text-xs font-mono uppercase tracking-wider mb-1">
              <GitFork className="w-4 h-4" />
              Structural Reasoning vs Pure Vector Similarity
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Multi-Hop Enterprise Entity Graph
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Vectors excel at fuzzy semantic matching within a single text passage, but they cannot traverse relational dependencies across disconnected entities.
              This graph layer provides the deterministic multi-hop topological reasoning.
            </p>
          </div>

          {/* Asset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Select Topology Path:</span>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              {MOCK_ASSETS.map(asset => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Visual Multi-Hop Graph Visualization */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 relative overflow-hidden">
        <div className="text-center mb-8">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Active Multi-Hop Dependency Chain for <strong className="text-white">{currentAsset.name}</strong>
          </span>
        </div>

        {/* 4 Connected Nodes in a Chain */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
          {/* Node 1: Vendor */}
          <div className="bg-slate-900/90 border border-blue-500/40 rounded-2xl p-5 shadow-lg shadow-blue-500/5 relative group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                1. Vendor Node
              </span>
              <span className="text-xs font-mono text-slate-500">Tier {currentVendor.tier}</span>
            </div>
            <h4 className="font-bold text-white text-sm mb-1">{currentVendor.name}</h4>
            <div className="space-y-1 text-xs text-slate-400 mt-2">
              <div>Contract: <span className="text-emerald-400 font-medium">{currentVendor.contract_status}</span></div>
              <div>Category: <span className="text-slate-300">{currentVendor.metadata.category}</span></div>
              <div>SLA: <span className="text-slate-300">{currentVendor.metadata.sla_percentage}%</span></div>
            </div>
            {/* Edge label right */}
            <div className="hidden md:block absolute -right-6 top-1/2 -translate-y-1/2 z-20">
              <span className="text-[10px] font-mono text-indigo-400 bg-slate-950 px-1 border border-slate-800 rounded">
                --supplies--&gt;
              </span>
            </div>
          </div>

          {/* Node 2: Asset */}
          <div className="bg-slate-900/90 border border-indigo-500/50 rounded-2xl p-5 shadow-lg shadow-indigo-500/10 relative group ring-1 ring-indigo-500/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                2. Asset Node
              </span>
              <span className="text-xs font-mono text-slate-500">{currentAsset.region}</span>
            </div>
            <h4 className="font-bold text-white text-sm mb-1">{currentAsset.name}</h4>
            <div className="space-y-1 text-xs text-slate-400 mt-2">
              <div>Type: <span className="text-slate-300 capitalize">{currentAsset.type.replace('_', ' ')}</span></div>
              <div>Criticality: <span className="text-indigo-300">{currentAsset.criticality}</span></div>
              {currentAsset.specs.cores && (
                <div>Specs: <span className="text-slate-300">{currentAsset.specs.cores} Cores / {currentAsset.specs.ram_gb}GB</span></div>
              )}
            </div>
            {/* Edge label right */}
            <div className="hidden md:block absolute -right-6 top-1/2 -translate-y-1/2 z-20">
              <span className="text-[10px] font-mono text-amber-400 bg-slate-950 px-1 border border-slate-800 rounded">
                --impacts--&gt;
              </span>
            </div>
          </div>

          {/* Node 3: Business Unit */}
          <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-lg shadow-amber-500/5 relative group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                3. Business Unit
              </span>
              <span className="text-xs font-mono text-slate-500">{currentBU.cost_center}</span>
            </div>
            <h4 className="font-bold text-white text-sm mb-1">{currentBU.name}</h4>
            <div className="space-y-1 text-xs text-slate-400 mt-2">
              <div>Owner: <span className="text-slate-300">{currentBU.lead}</span></div>
              <div>Cost Center: <span className="text-slate-300">{currentBU.cost_center}</span></div>
            </div>
            {/* Edge label right */}
            <div className="hidden md:block absolute -right-6 top-1/2 -translate-y-1/2 z-20">
              <span className="text-[10px] font-mono text-rose-400 bg-slate-950 px-1 border border-slate-800 rounded">
                --tied-to--&gt;
              </span>
            </div>
          </div>

          {/* Node 4: Incident Post-Mortem */}
          <div className="bg-slate-900/90 border border-rose-500/40 rounded-2xl p-5 shadow-lg shadow-rose-500/5 relative group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                4. Incident Post-Mortem
              </span>
              {currentIncident && (
                <span className="text-xs font-mono text-rose-400 font-bold">{currentIncident.severity}</span>
              )}
            </div>
            {currentIncident ? (
              <>
                <h4 className="font-bold text-white text-xs mb-1 line-clamp-2">{currentIncident.title}</h4>
                <div className="space-y-1 text-xs text-slate-400 mt-2">
                  <div>Downtime: <span className="text-rose-300 font-bold">{currentIncident.downtime_minutes} min</span></div>
                  <div className="text-[11px] text-slate-300 italic line-clamp-3 mt-1">
                    "{currentIncident.root_cause}"
                  </div>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                No active severity incidents recorded for this asset.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Structural Reasoning Case Study */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold mb-2">
            <HelpCircle className="w-4 h-4" />
            Where Pure Vector Search Fails
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Consider the query: <em>"Which Business Unit suffered revenue impact from our Tier-1 database provider in us-east-1?"</em>
            <br /><br />
            An embedding model looks for passages with matching semantic terms. But the vendor contract document doesn't mention the internal business unit, and the internal payment cost-center document doesn't mention the cloud vendor's hypervisor ticket number.
            Without deterministic entity linkage, vector search returns disconnected chunks and the LLM hallucinates connections.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2">
            <CheckCircle className="w-4 h-4" />
            How the Knowledge Graph Solves It
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Our PostgreSQL CTE performs exact multi-hop joins:
            <br />
            <code className="text-emerald-300 font-mono text-[11px] block bg-slate-950 p-2 rounded mt-2">
              vendors (tier = '1') &rarr; assets (region = 'us-east-1') &rarr; business_units &rarr; incidents
            </code>
            <br />
            This structural context is fed directly into the prompt alongside the vector-matched chunk text, providing mathematically verified provenance.
          </p>
        </div>
      </div>
    </div>
  );
};
