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

// Safely load firebase-applet-config.json if it exists, without failing Vite/Rolldown bundling when deleted/gitignored
let rawConfig: Partial<FirebaseClientConfig> = {};

if (typeof import.meta !== 'undefined' && typeof (import.meta as any).glob === 'function') {
  const modules = (import.meta as any).glob('../../firebase-applet-config.json', { eager: true });
  const matched = modules['../../firebase-applet-config.json'];
  if (matched) {
    rawConfig = ((matched as any).default || matched) as Partial<FirebaseClientConfig>;
  }
} else if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<FirebaseClientConfig>;
    }
  } catch {
    rawConfig = {};
  }
}

const getEnv = (viteKey: string, nodeKey: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envObj = import.meta.env as Record<string, any>;
    if (envObj[viteKey]) return String(envObj[viteKey]);
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[viteKey] || process.env[nodeKey];
  }
  return undefined;
};

// Check if credentials are genuine (not dummy placeholders)
export const isFirebaseConfigured = (): boolean => {
  const apiKey = getEnv('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY') || rawConfig.apiKey;
  const projectId = getEnv('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID') || rawConfig.projectId;

  if (!apiKey || !projectId) return false;
  if (apiKey.includes('YOUR_FIREBASE') || apiKey.includes('YOUR_API_KEY') || apiKey === 'placeholder') return false;
  if (projectId.includes('your-firebase') || projectId.includes('your-gcp') || projectId === 'placeholder') return false;

  return true;
};

export const getSafeFirebaseConfig = (): FirebaseClientConfig => {
  return {
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID') || rawConfig.projectId || 'demo-project',
    appId: getEnv('VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID') || rawConfig.appId || '1:000000000000:web:demo',
    apiKey: getEnv('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY') || rawConfig.apiKey || 'demo-api-key',
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN') || rawConfig.authDomain || 'demo-project.firebaseapp.com',
    firestoreDatabaseId: rawConfig.firestoreDatabaseId || '(default)',
    storageBucket: rawConfig.storageBucket || 'demo-project.firebasestorage.app',
    messagingSenderId: rawConfig.messagingSenderId || '000000000000',
    oAuthClientId: rawConfig.oAuthClientId || '',
  };
};
