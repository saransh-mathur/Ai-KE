export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/aiff',
] as const;

export type SupportedAudioMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB limit for inline audio transcription

const MIME_ALIAS_MAP: Record<string, SupportedAudioMimeType> = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/mp3': 'audio/mp3',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'audio/aac': 'audio/aac',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
};

/**
 * Normalizes browser or file MIME strings (e.g. "audio/webm;codecs=opus")
 * to clean MIME types supported by gemini-3.5-transcribe.
 */
export function normalizeAudioMimeType(rawMimeType?: string | null, fileName?: string | null): SupportedAudioMimeType | null {
  if (rawMimeType) {
    const baseMime = rawMimeType.split(';')[0].trim().toLowerCase();
    if (baseMime in MIME_ALIAS_MAP) {
      return MIME_ALIAS_MAP[baseMime];
    }
  }

  if (fileName) {
    const ext = fileName.split('.').pop()?.trim().toLowerCase();
    switch (ext) {
      case 'wav':
        return 'audio/wav';
      case 'mp3':
        return 'audio/mp3';
      case 'webm':
        return 'audio/webm';
      case 'ogg':
      case 'opus':
        return 'audio/ogg';
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'aif':
      case 'aiff':
        return 'audio/aiff';
    }
  }

  return null;
}

/**
 * Strips any `data:<mime>;base64,` URL prefix and returns both embedded MIME (if present) and raw base64.
 */
export function stripBase64DataUrlPrefix(input: string): { embeddedMime: string | null; base64: string } {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.*)$/i);
  if (match) {
    return {
      embeddedMime: match[1].trim().toLowerCase(),
      base64: match[2].replace(/\s+/g, ''),
    };
  }
  return {
    embeddedMime: null,
    base64: trimmed.replace(/\s+/g, ''),
  };
}

/**
 * Estimates decoded byte length from a base64 string without allocating a full Buffer.
 */
export function estimateBase64ByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * Validates and normalizes an incoming audio transcription payload.
 */
export function validateAudioPayload(params: {
  audioBase64?: string;
  mimeType?: string;
  fileName?: string;
}):
  | { ok: true; base64: string; mimeType: SupportedAudioMimeType; byteLength: number }
  | { ok: false; error: string } {
  const { audioBase64, mimeType, fileName } = params;

  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.trim().length === 0) {
    return { ok: false, error: 'Audio data (audioBase64) is required.' };
  }

  const { embeddedMime, base64 } = stripBase64DataUrlPrefix(audioBase64);
  if (base64.length < 16) {
    return { ok: false, error: 'Recorded audio clip is empty or too short to transcribe.' };
  }

  // Basic base64 character validation
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
    return { ok: false, error: 'Invalid base64 audio encoding.' };
  }

  const byteLength = estimateBase64ByteLength(base64);
  if (byteLength > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `Audio file exceeds inline transcription limit (${Math.round(byteLength / (1024 * 1024))}MB > 20MB).`,
    };
  }

  const resolvedMime = normalizeAudioMimeType(mimeType || embeddedMime, fileName);
  if (!resolvedMime) {
    return {
      ok: false,
      error: `Unsupported audio format${mimeType ? `: ${mimeType}` : ''}. Supported formats: WAV, MP3, WebM, OGG, M4A, AAC, FLAC.`,
    };
  }

  return {
    ok: true,
    base64,
    mimeType: resolvedMime,
    byteLength,
  };
}

/**
 * Formats elapsed recording seconds as MM:SS.
 */
export function formatRecordingDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
