import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  ConfirmationResult,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const configuredDatabaseId = (
  firebaseConfig as { firestoreDatabaseId?: string }
).firestoreDatabaseId;

export const db = configuredDatabaseId
  ? getFirestore(app, configuredDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let cachedGoogleAccessToken: string | null = null;
let cachedTokenExpiresAtMs = 0;

export function setCachedGoogleAccessToken(
  token: string | null,
  ttlSeconds = 3300
): void {
  if (!token) {
    cachedGoogleAccessToken = null;
    cachedTokenExpiresAtMs = 0;
    return;
  }
  cachedGoogleAccessToken = token;
  cachedTokenExpiresAtMs = Date.now() + Math.max(60, ttlSeconds) * 1000;
}

export function getCachedGoogleAccessToken(): string | null {
  if (!cachedGoogleAccessToken) return null;
  if (Date.now() >= cachedTokenExpiresAtMs) {
    cachedGoogleAccessToken = null;
    cachedTokenExpiresAtMs = 0;
    return null;
  }
  return cachedGoogleAccessToken;
}

export function clearCachedGoogleAccessToken(): void {
  cachedGoogleAccessToken = null;
  cachedTokenExpiresAtMs = 0;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isBenignAbortError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /abort|canceled|cancelled|network.*changed/i.test(msg);
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isBenignAbortError(error)) {
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function validateFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isBenignAbortError(error)) return;
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function normalizeEmailToKey(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 120);
}
