import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SCOPES } from './services/googleSheetsService';
import { isBenignAbortError } from './utils/abortErrorGuard';

export { isBenignAbortError, SCOPES };

const app = initializeApp(firebaseConfig);

const configuredDatabaseId = (
  firebaseConfig as { firestoreDatabaseId?: string }
).firestoreDatabaseId;

export const db = configuredDatabaseId
  ? getFirestore(app, configuredDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});
googleProvider.setCustomParameters({ prompt: 'select_account' });

// تخزين رمز الوصول (OAuth Access Token) في الذاكرة فقط (In-Memory Only) وفق معايير الأمان دون استخدام localStorage أو sessionStorage
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

/**
 * طلب أو تجديد رمز الوصول لقراءة Google Sheets بإذن المستخدم المباشر عند الحاجة
 */
export async function requestGoogleSheetsAccessToken(options?: {
  forceConsent?: boolean;
}): Promise<string> {
  if (!options?.forceConsent) {
    const existing = getCachedGoogleAccessToken();
    if (existing) return existing;
  }

  const sheetsProvider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => {
    sheetsProvider.addScope(scope);
  });
  sheetsProvider.setCustomParameters({
    prompt: options?.forceConsent ? 'consent select_account' : 'select_account',
  });

  const currentUser = auth.currentUser;
  const hasGoogleLinked = Boolean(
    currentUser?.providerData?.some((p) => p.providerId === 'google.com')
  );

  const result =
    currentUser && hasGoogleLinked
      ? await reauthenticateWithPopup(currentUser, sheetsProvider)
      : await signInWithPopup(auth, sheetsProvider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      'تعذر استلام رمز إذن Google Sheets. يرجى الموافقة على صلاحية القراءة في نافذة Google والمحاولة مجدداً.'
    );
  }

  setCachedGoogleAccessToken(credential.accessToken);
  return credential.accessToken;
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
    if (isBenignAbortError(error)) {
      return;
    }
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
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
