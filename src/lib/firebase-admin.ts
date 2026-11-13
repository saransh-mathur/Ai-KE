import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getSafeFirebaseConfig, isFirebaseConfigured } from './firebase-config.ts';

const config = getSafeFirebaseConfig();
export const isConfigured = isFirebaseConfigured();

if (!getApps().length) {
  initializeApp({
    projectId: config.projectId,
  });
}

export const adminAuth = getAuth();
