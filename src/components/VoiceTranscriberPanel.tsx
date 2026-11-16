import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  Upload,
  Sparkles,
  Copy,
  Check,
  Trash2,
  ArrowUpRight,
  AlertCircle,
  Loader2,
  Volume2,
  X,
  Clock,
} from 'lucide-react';
import { formatRecordingDuration, normalizeAudioMimeType } from '../lib/audio-utils.ts';
import { useAuth } from '../context/AuthContext.tsx';

export interface TranscriptRecord {
  id: number;
  userEmail: string;
  mimeType: string;
  durationSeconds: number;
  transcriptText: string;
  modelUsed: string;
  targetContext: string;
  createdAt: string;
}

interface VoiceTranscriberPanelProps {
  onApplyTranscript: (text: string, autoRunSearch?: boolean) => void;
  onClose?: () => void;
}

function selectPreferredRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio buffer.'));
    reader.readAsDataURL(blob);
  });
}

export const VoiceTranscriberPanel: React.FC<VoiceTranscriberPanelProps> = ({
  onApplyTranscript,
  onClose,
}) => {
  const { idToken } = useAuth();

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(12).fill(12));
  const [autoFillSearch, setAutoFillSearch] = useState<boolean>(true);
  const [latestTranscript, setLatestTranscript] = useState<string | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<TranscriptRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const elapsedRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      const res = await fetch('/api/transcripts', { headers });
      if (res.ok) {
        const rows = await res.json();
        setHistory(Array.isArray(rows) ? rows : []);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }, [idToken]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const stopAudioMonitoring = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (analyserFrameRef.current !== null) {
      window.cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioLevels(Array(12).fill(12));
  }, []);

  useEffect(() => {
    return () => {
      stopAudioMonitoring();
      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl);
      }
    };
  }, [stopAudioMonitoring, previewAudioUrl]);

  const submitAudioForTranscription = async (params: {
    blob: Blob;
    mimeType: string;
    fileName?: string;
    durationSeconds: number;
  }) => {
    setIsTranscribing(true);
    setErrorMessage(null);

    try {
      const objectUrl = URL.createObjectURL(params.blob);
      setPreviewAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });

      const base64DataUrl = await blobToBase64(params.blob);
      const cleanMime =
        normalizeAudioMimeType(params.mimeType || params.blob.type, params.fileName) || 'audio/webm';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const res = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          audioBase64: base64DataUrl,
          mimeType: cleanMime,
          fileName: params.fileName,
          durationSeconds: params.durationSeconds,
          targetContext: 'search_query',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Transcription failed (HTTP ${res.status})`);
      }

      const text = typeof data.transcript === 'string' ? data.transcript : '';
      setLatestTranscript(text);

      if (data.record) {
        setHistory((prev) => [data.record, ...prev.filter((r) => r.id !== data.record.id)]);
      } else {
        fetchHistory();
      }

      if (autoFillSearch && text) {
        onApplyTranscript(text, false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to transcribe audio. Please verify microphone capture and server configuration.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleStartRecording = async () => {
    setErrorMessage(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        'Live microphone recording is not supported in this browser context. You can still upload an audio file (WAV, MP3, WebM, OGG, M4A) below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMime = selectPreferredRecorderMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      elapsedRef.current = 0;
      setElapsedSeconds(0);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || preferredMime || 'audio/webm';
        const recordedBlob = new Blob(chunksRef.current, { type: finalMime });
        const duration = Math.max(1, elapsedRef.current);
        stopAudioMonitoring();
        setIsRecording(false);

        if (recordedBlob.size > 0) {
          submitAudioForTranscription({
            blob: recordedBlob,
            mimeType: finalMime,
            durationSeconds: duration,
          });
        } else {
          setErrorMessage('No audio data was captured from the microphone.');
        }
      };

      recorder.onerror = () => {
        stopAudioMonitoring();
        setIsRecording(false);
        setErrorMessage('Microphone recording encountered a hardware error.');
      };

      // Live frequency meter via Web Audio API
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            const bars = Array.from({ length: 12 }, (_, idx) => {
              const val = dataArray[idx % dataArray.length] || 0;
              return Math.max(12, Math.min(100, Math.round((val / 255) * 100)));
            });
            setAudioLevels(bars);
            analyserFrameRef.current = window.requestAnimationFrame(updateMeter);
          };
          updateMeter();
        }
      } catch {
        // Level meter is decorative; recording continues without it
      }

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSeconds(elapsedRef.current);
      }, 1000);
    } catch (err: any) {
      stopAudioMonitoring();
      setIsRecording(false);

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was denied. Allow microphone access in your browser site settings or upload an audio file instead.'
        );
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setErrorMessage(
          'No microphone device was detected. Connect a microphone or upload a pre-recorded audio file below.'
        );
      } else {
        setErrorMessage(err?.message || 'Unable to start microphone recording.');
      }
    }
  };

  const handleStopAndTranscribe = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopAudioMonitoring();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    await submitAudioForTranscription({
      blob: file,
      mimeType: file.type,
      fileName: file.name,
      durationSeconds: 0,
    });
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDeleteRecord = async (id: number) => {
    try {
      const headers: Record<string, string> = {};
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      const res = await fetch(`/api/transcripts/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      // Non-fatal
    }
  };

  return (
    <div
      id="voice-transcriber-panel"
      className="bg-slate-50 dark:bg-slate-950/90 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-4 space-y-4 transition-colors"
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                Voice &amp; Audio Transcription
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-medium">
                gemini-3.5-transcribe
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Speak an infrastructure query or upload incident bridge audio — transcripts persist in Cloud SQL.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoFillSearch}
              onChange={(e) => setAutoFillSearch(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Auto-fill query</span>
          </label>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close voice transcriber"
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Capture Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {!isRecording ? (
            <button
              id="start-mic-recording-btn"
              type="button"
              onClick={handleStartRecording}
              disabled={isTranscribing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm shadow-rose-600/20 transition-all disabled:opacity-50"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record Microphone</span>
            </button>
          ) : (
            <button
              id="stop-mic-recording-btn"
              type="button"
              onClick={handleStopAndTranscribe}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-semibold shadow-sm transition-all"
            >
              <Square className="w-3 h-3 fill-current text-rose-500" />
              <span>Stop &amp; Transcribe ({formatRecordingDuration(elapsedSeconds)})</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            id="audio-upload-input"
            type="file"
            accept="audio/*,.wav,.mp3,.webm,.m4a,.ogg,.aac,.flac"
            onChange={handleFileUpload}
            className="sr-only"
          />
          <button
            id="upload-audio-file-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording || isTranscribing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Upload Audio File</span>
          </button>
        </div>

        {/* Live Recording Waveform & Status */}
        <div className="flex items-center gap-2.5 min-h-[28px]">
          {isRecording && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                {audioLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${Math.max(18, lvl)}%` }}
                    className="w-1 rounded-full bg-rose-500 dark:bg-rose-400 transition-all duration-75"
                  />
                ))}
              </div>
              <span className="text-[11px] font-mono font-semibold text-rose-700 dark:text-rose-300">
                REC {formatRecordingDuration(elapsedSeconds)}
              </span>
            </div>
          )}

          {isTranscribing && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-500/40 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Transcribing with gemini-3.5-transcribe...</span>
            </div>
          )}
        </div>
      </div>

      {/* Inline Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-xs text-rose-800 dark:text-rose-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Latest Transcript Card & Playback */}
      {(latestTranscript || previewAudioUrl) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> {latestTranscript ? 'Latest Transcription' : 'Audio Clip Preview'}
            </span>
            {latestTranscript && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyText(latestTranscript, 'latest')}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300 font-medium transition-colors"
                >
                  {copiedId === 'latest' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onApplyTranscript(latestTranscript, true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Search with Transcript</span>
                </button>
              </div>
            )}
          </div>

          {latestTranscript && (
            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
              {latestTranscript}
            </p>
          )}

          {previewAudioUrl && (
            <audio
              controls
              src={previewAudioUrl}
              className="w-full h-8 accent-indigo-600"
            />
          )}
        </div>
      )}

      {/* Recent Cloud SQL Transcriptions */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-mono">
          <span className="flex items-center gap-1.5 uppercase tracking-wider font-semibold">
            <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            Recent Transcriptions (Cloud SQL)
          </span>
          <span>{loadingHistory ? 'Loading...' : `${history.length} saved`}</span>
        </div>

        {history.length === 0 && !loadingHistory ? (
          <div className="text-[11px] text-slate-500 dark:text-slate-500 italic py-2">
            No voice transcriptions saved yet. Record a microphone query or upload an audio clip above.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {history.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                    {item.transcriptText}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{item.modelUsed}</span>
                    <span>&bull;</span>
                    <span>{item.mimeType}</span>
                    {item.durationSeconds > 0 && (
                      <>
                        <span>&bull;</span>
                        <span>{formatRecordingDuration(item.durationSeconds)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onApplyTranscript(item.transcriptText, false)}
                    title="Insert transcript into search input"
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 transition-colors"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(item.transcriptText, String(item.id))}
                    title="Copy transcript"
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    {copiedId === String(item.id) ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRecord(item.id)}
                    title="Delete transcript"
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
