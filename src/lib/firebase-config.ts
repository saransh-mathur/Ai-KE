export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  oAuthClientId?: string;
}

// Safely attempt to import the raw config if present
let rawConfig: Partial<FirebaseClientConfig> = {};
try {
  // @ts-ignore - dynamic import fallback if gitignored or omitted
  const imported = await import('../../firebase-applet-config.json');
  rawConfig = (imported.default || imported) as Partial<FirebaseClientConfig>;
} catch {
  rawConfig = {};
}

// Check if credentials are genuine (not dummy placeholders)
export const isFirebaseConfigured = (): boolean => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as Record<string, any>) : {};
  const apiKey = env.VITE_FIREBASE_API_KEY || rawConfig.apiKey;
  const projectId = env.VITE_FIREBASE_PROJECT_ID || rawConfig.projectId;

  if (!apiKey || !projectId) return false;
  if (apiKey.includes('YOUR_FIREBASE') || apiKey.includes('YOUR_API_KEY') || apiKey === 'placeholder') return false;
  if (projectId.includes('your-firebase') || projectId.includes('your-gcp') || projectId === 'placeholder') return false;

  return true;
};

export const getSafeFirebaseConfig = (): FirebaseClientConfig => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as Record<string, any>) : {};

  return {
    projectId: (env.VITE_FIREBASE_PROJECT_ID as string) || rawConfig.projectId || 'demo-project',
    appId: (env.VITE_FIREBASE_APP_ID as string) || rawConfig.appId || '1:000000000000:web:demo',
    apiKey: (env.VITE_FIREBASE_API_KEY as string) || rawConfig.apiKey || 'demo-api-key',
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string) || rawConfig.authDomain || 'demo-project.firebaseapp.com',
    firestoreDatabaseId: rawConfig.firestoreDatabaseId || '(default)',
    storageBucket: rawConfig.storageBucket || 'demo-project.firebasestorage.app',
    messagingSenderId: rawConfig.messagingSenderId || '000000000000',
    oAuthClientId: rawConfig.oAuthClientId || '',
  };
};
