import React, { useState } from 'react';
import {
  FileImage,
  Sparkles,
  ArrowRight,
  Database,
  Server,
  Network,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
  RefreshCw,
  Cpu,
  Layers,
  GitFork,
  Download
} from 'lucide-react';
import { ArchitectureDiagramAnalysisResult, ExtractedGraphNode, ExtractedGraphEdge } from '../lib/types.ts';

const PRESET_DIAGRAMS = [
  {
    id: 'aws_multi_az_payment',
    title: 'AWS Multi-AZ Payment Cluster',
    provider: 'Amazon Web Services (AWS)',
    description: 'Mission-critical payment gateway with active-passive Aurora PG, NLB ingress, and Pure Storage NVMe cache.',
    svgType: 'payment',
  },
  {
    id: 'hybrid_cloud_backbone',
    title: 'Global Hybrid Cloud & FinTech Spine',
    provider: 'Hybrid (AWS + On-Prem + EU CloudScale)',
    description: 'Cross-continent spine-leaf network with Cisco Nexus 9336C and transatlantic Kafka CDC pipe.',
    svgType: 'backbone',
  },
];

export const MultiModalVisionStudio: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<string>('aws_multi_az_payment');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<ArchitectureDiagramAnalysisResult | null>(null);
  const [ingestedSuccess, setIngestedSuccess] = useState<boolean>(false);
  const [customFileUploaded, setCustomFileUploaded] = useState<string | null>(null);

  const handleRunVisionExtraction = async (presetId: string = selectedPreset) => {
    setIsAnalyzing(true);
    setIngestedSuccess(false);

    try {
      const res = await fetch('/api/multimodal/parse-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagramPreset: presetId,
          imageBase64: customFileUploaded || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to parse diagram: status ${res.status}`);
      }

      const data = await res.json();
      setAnalysisResult(data.diagram);
    } catch (err: any) {
      console.error('Vision extraction error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCustomFileUploaded(reader.result as string);
        handleRunVisionExtraction('custom_upload');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              Multi-Modal Document &amp; Vision Ingestion
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Architecture Diagram Vision Parser
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Natively parses visual architecture diagrams (PNG, JPEG, PDF, Lucidchart exports) using Vision-Language Models.
              Extracts infrastructure components, vendors, and network flows directly into queryable graph nodes and relational schemas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer transition-colors shadow-sm">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Upload Custom Diagram</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Preset Diagram Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRESET_DIAGRAMS.map((preset) => {
          const isSelected = selectedPreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => {
                setSelectedPreset(preset.id);
                setCustomFileUploaded(null);
                handleRunVisionExtraction(preset.id);
              }}
              className={`p-4 rounded-xl border text-left transition-all relative ${
                isSelected
                  ? 'bg-slate-850 border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">{preset.title}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {preset.provider}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* Main Split-Screen Workspace: Visual Diagram vs Extracted Graph Schema */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Visual Diagram Canvas */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <FileImage className="w-4 h-4 text-sky-400" />
                <span>Visual Diagram Source</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 uppercase">
                {customFileUploaded ? 'Custom Upload' : selectedPreset}
              </span>
            </div>

            {/* Rendered Diagram Visual Mockup */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 min-h-[320px] flex flex-col justify-center items-center relative overflow-hidden">
              {customFileUploaded ? (
                <img
                  src={customFileUploaded}
                  alt="Uploaded Architecture Diagram"
                  className="max-h-[280px] w-auto object-contain rounded-lg shadow"
                />
              ) : selectedPreset === 'aws_multi_az_payment' ? (
                <div className="w-full space-y-4 text-center">
                  {/* Visual Node: NLB */}
                  <div className="bg-slate-900 border border-sky-500/40 rounded-lg p-2.5 max-w-[220px] mx-auto shadow-sm">
                    <span className="text-[10px] font-mono text-sky-400 uppercase block">Ingress Proxy</span>
                    <strong className="text-xs text-white">Payment NLB / API Gateway</strong>
                  </div>

                  <div className="text-slate-500 text-xs font-mono">&darr; mTLS HTTPS &darr;</div>

                  {/* Multi-AZ Nodes */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900 border border-indigo-500/40 rounded-lg p-2.5 shadow-sm">
                      <span className="text-[10px] font-mono text-indigo-400 uppercase block">us-east-1a (Primary)</span>
                      <strong className="text-xs text-white">Aurora PG Primary</strong>
                      <span className="text-[10px] text-emerald-400 block mt-1">&bull; Active RW</span>
                    </div>

                    <div className="bg-slate-900 border border-indigo-500/40 rounded-lg p-2.5 shadow-sm">
                      <span className="text-[10px] font-mono text-indigo-400 uppercase block">us-east-1b (Standby)</span>
                      <strong className="text-xs text-white">Aurora Read Replica</strong>
                      <span className="text-[10px] text-sky-400 block mt-1">&bull; Async WAL</span>
                    </div>
                  </div>

                  <div className="text-slate-500 text-xs font-mono">&darr; NVMe-oF &darr;</div>

                  {/* Pure Storage Cache */}
                  <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-2.5 max-w-[220px] mx-auto shadow-sm">
                    <span className="text-[10px] font-mono text-amber-400 uppercase block">Low-Latency Cache</span>
                    <strong className="text-xs text-white">Pure FlashBlade SAN</strong>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-4 text-center">
                  <div className="bg-slate-900 border border-purple-500/40 rounded-lg p-2.5 max-w-[220px] mx-auto">
                    <span className="text-[10px] font-mono text-purple-400 uppercase block">us-west-2</span>
                    <strong className="text-xs text-white">Cisco Nexus 9336C Spine</strong>
                  </div>
                  <div className="text-slate-500 text-xs font-mono">&harr; Transatlantic IPsec &harr;</div>
                  <div className="bg-slate-900 border border-blue-500/40 rounded-lg p-2.5 max-w-[220px] mx-auto">
                    <span className="text-[10px] font-mono text-blue-400 uppercase block">europe-west1</span>
                    <strong className="text-xs text-white">SRV-Alpha (CloudScale EU)</strong>
                  </div>
                  <div className="text-slate-500 text-xs font-mono">&darr; Kafka Snowpipe &darr;</div>
                  <div className="bg-slate-900 border border-sky-500/40 rounded-lg p-2.5 max-w-[220px] mx-auto">
                    <span className="text-[10px] font-mono text-sky-400 uppercase block">us-east-1</span>
                    <strong className="text-xs text-white">Snowflake Analytics Core</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Gemini 3.8 Flash Vision Enabled</span>
            <button
              onClick={() => handleRunVisionExtraction()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Parsing Diagram...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse with Vision LLM</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column (7 Cols): Extracted Graph & Topological Relations */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <GitFork className="w-4 h-4 text-purple-400" />
                <span>Extracted Graph Topology &amp; Queryable Entities</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visual boxes and arrows automatically converted into PostgreSQL relational rows and vector chunks.
              </p>
            </div>

            {analysisResult && (
              <button
                onClick={() => setIngestedSuccess(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                  ingestedSuccess
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : 'bg-indigo-600/90 hover:bg-indigo-600 text-white border-indigo-500/40'
                }`}
              >
                {ingestedSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ingested into Graph!</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Ingest to Live Graph</span>
                  </>
                )}
              </button>
            )}
          </div>

          {!analysisResult ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Cpu className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">Click &ldquo;Parse with Vision LLM&rdquo; to extract relational nodes and topological dependencies.</p>
              <button
                onClick={() => handleRunVisionExtraction()}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow"
              >
                Run Automatic Extraction
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Extracted Nodes List */}
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
                  1. Discovered Infrastructure Nodes ({analysisResult.nodes.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysisResult.nodes.map((node: ExtractedGraphNode) => (
                    <div
                      key={node.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-white truncate font-medium">{node.name}</strong>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {node.type}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{node.vendor}</span>
                        <span className="text-slate-500">{node.region}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px]">
                        <span className="text-amber-400">{node.criticality}</span>
                        <span className="text-purple-400 font-mono">{node.securityClearance}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Extracted Edges / Network Flows */}
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
                  2. Inferred Directed Graph Edges ({analysisResult.edges.length})
                </span>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs font-mono">
                  {analysisResult.edges.map((edge: ExtractedGraphEdge, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-slate-300 text-[11px]">
                      <span className="text-sky-300">{edge.source}</span>
                      <ArrowRight className="w-3 h-3 text-purple-400" />
                      <span className="text-purple-400 font-semibold">{edge.relationship}</span>
                      <ArrowRight className="w-3 h-3 text-purple-400" />
                      <span className="text-indigo-300">{edge.target}</span>
                      {edge.protocol && (
                        <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded ml-auto">
                          {edge.protocol}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Inferred Single-Point-of-Failure & SLA Risks */}
              {analysisResult.extractedSlaRisks?.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Vision-Inferred SLA Risks &amp; Topology Bottlenecks</span>
                  </div>
                  <ul className="text-xs text-amber-200/90 space-y-1 list-disc list-inside">
                    {analysisResult.extractedSlaRisks.map((risk: string, idx: number) => (
                      <li key={idx}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
