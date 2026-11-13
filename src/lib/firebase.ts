import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getSafeFirebaseConfig, isFirebaseConfigured } from './firebase-config.ts';

const config = getSafeFirebaseConfig();
const app = !getApps().length ? initializeApp(config) : getApp();

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
export const isConfigured = isFirebaseConfigured();
