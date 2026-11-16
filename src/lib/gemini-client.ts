import { GoogleGenAI } from '@google/genai';

/**
 * Checks whether a real GEMINI_API_KEY is available in the server environment.
 */
export function isGeminiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0 && key !== 'MY_GEMINI_API_KEY');
}

/**
 * Creates a server-side @google/genai client with telemetry header.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets in AI Studio and add a valid GEMINI_API_KEY.'
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Formats @google/genai errors into clear, user-actionable messages without leaking secrets.
 */
export function formatGeminiErrorMessage(error: unknown): { status: number; message: string } {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown Gemini API error');
  const lower = rawMessage.toLowerCase();

  if (lower.includes('not configured') || lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
    return {
      status: 503,
      message: 'Gemini API key is missing or invalid. Add a valid GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  if (lower.includes('403') || lower.includes('permission') || lower.includes('forbidden')) {
    return {
      status: 403,
      message:
        'Gemini API permission denied (HTTP 403). Verify GEMINI_API_KEY and project access in Settings > Secrets.',
    };
  }

  if (lower.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and retry.',
    };
  }

  if (lower.includes('400') || lower.includes('unsupported') || lower.includes('invalid argument')) {
    return {
      status: 400,
      message: 'Unsupported audio format or invalid request payload. Try recording again or uploading WAV/MP3/WebM audio.',
    };
  }

  return {
    status: 500,
    message: `Gemini API request failed: ${rawMessage}`,
  };
}
