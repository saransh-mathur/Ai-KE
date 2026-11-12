import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Database,
  RefreshCw,
  Send,
  Layers,
  Radio
} from 'lucide-react';

interface WebhookEventItem {
  id: number;
  source: string;
  eventAction: string;
  rawPayload: any;
  extractedAssetId: string | null;
  generatedIncidentId: string | null;
  generatedChunkId: string | null;
  status: string;
  createdAt: string;
}

export const WebhookIngestionHub: React.FC = () => {
  const [events, setEvents] = useState<WebhookEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/webhooks/recent');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (e) {
      console.error('Failed to fetch webhook events:', e);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const triggerSimulatedAlert = async (type: 'pagerduty' | 'cloudwatch' | 'jira') => {
    setIsTriggering(true);
    setTriggerSuccess(null);

    const PAYLOADS = {
      pagerduty: {
        source: 'pagerduty',
        title: 'Aurora PG us-east-1 Replication Lag Critical Threshold',
        severity: 'SEV-1',
        rootCause: 'Cross-AZ IOPS starvation during hypervisor patch triggered 47m WAL lag.',
        assetId: 'ast-rds-01',
        downtimeMinutes: 47,
      },
      cloudwatch: {
        source: 'cloudwatch',
        title: 'AWS CloudWatch Alarm: PureFlashBlade_ThroughputLimitBreached',
        severity: 'SEV-2',
        rootCause: 'FlashBlade NVMe cache write buffers saturated past 85% IOPS watermark.',
        assetId: 'ast-san-01',
        downtimeMinutes: 20,
      },
      jira: {
        source: 'jira',
        title: 'JIRA INC-9905: Spine Switch BGP Neighbor Flapping on Nexus 9336C',
        severity: 'SEV-2',
        rootCause: 'Jumbo frame MTU mismatch between spine switch and checkout worker pool.',
        assetId: 'ast-sw-01',
        downtimeMinutes: 18,
      },
    };

    try {
      const res = await fetch('/api/webhooks/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PAYLOADS[type]),
      });

      if (res.ok) {
        const data = await res.json();
        setTriggerSuccess(data.message);
        fetchEvents();
      }
    } catch (e) {
      console.error('Simulation error:', e);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-wider mb-1">
              <Radio className="w-4 h-4 animate-pulse" />
              Automated Dynamic Connectors &amp; Pipeline
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Real-Time Webhook Ingestion Pipeline
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Ingests live incident alerts from PagerDuty, Jira, and AWS CloudWatch. Dynamically updates PostgreSQL relational
              incident nodes, generates semantic vector chunks, and maps multi-hop graph relations without manual ETL or database re-syncs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchEvents}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh Events</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connectors Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* PagerDuty */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PagerDuty Connector
            </span>
            <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Webhook: <code className="text-indigo-300">incident.trigger</code> &bull; Priority &rarr; SEV mapping
          </p>
          <button
            onClick={() => triggerSimulatedAlert('pagerduty')}
            disabled={isTriggering}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulate PagerDuty Alert</span>
          </button>
        </div>

        {/* AWS CloudWatch */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              AWS CloudWatch SNS
            </span>
            <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Webhook: <code className="text-indigo-300">ALARM_STATE_CHANGE</code> &bull; IOPS &amp; CPU metrics
          </p>
          <button
            onClick={() => triggerSimulatedAlert('cloudwatch')}
            disabled={isTriggering}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>Simulate CloudWatch Alarm</span>
          </button>
        </div>

        {/* Jira Service Management */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Jira IT Service Desk
            </span>
            <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Webhook: <code className="text-indigo-300">issue_created</code> &bull; Post-mortem ticket ingest
          </p>
          <button
            onClick={() => triggerSimulatedAlert('jira')}
            disabled={isTriggering}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span>Simulate Jira Ticket</span>
          </button>
        </div>
      </div>

      {/* Confirmation Toast */}
      {triggerSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{triggerSuccess} &bull; Generated new pgvector chunk &amp; updated graph relations!</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">Zero-ETL Live Sync</span>
        </div>
      )}

      {/* Ingested Webhook Stream Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Live Incident Stream Audit Log (Cloud SQL PostgreSQL)</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">{events.length} Events Ingested</span>
        </div>

        {events.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-mono">
            No live webhook alerts ingested yet. Click any simulation button above to trigger live streaming ingestion!
          </div>
        ) : (
          <div className="space-y-2.5">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 text-xs space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">
                      {ev.source}
                    </span>
                    <strong className="text-white text-xs">{ev.rawPayload?.title || ev.eventAction}</strong>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    <span className="text-emerald-400">&bull; {ev.status}</span>
                    <span>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-400 font-mono">
                  <div>
                    <span className="text-slate-500">Target Asset: </span>
                    <span className="text-indigo-300">{ev.extractedAssetId || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Incident Node: </span>
                    <span className="text-purple-300">{ev.generatedIncidentId || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">pgvector Chunk: </span>
                    <span className="text-emerald-300">{ev.generatedChunkId || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
