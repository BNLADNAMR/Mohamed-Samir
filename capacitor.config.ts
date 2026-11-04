import fs from 'node:fs';
import path from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

interface AppIdentityFile {
  appId?: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
}

function readAppIdentity(): AppIdentityFile {
  try {
    const filePath = path.resolve(process.cwd(), 'app-identity.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AppIdentityFile;
    }
  } catch {
    // Fallback to neutral defaults if identity file is missing or malformed
  }
  return {};
}

const appIdentity = readAppIdentity();

const resolvedAppId = (
  process.env.CAP_APP_ID ||
  appIdentity.appId ||
  'com.workspace.shifttracker'
).trim();

const resolvedAppName = (
  process.env.CAP_APP_NAME ||
  appIdentity.appName ||
  'Shift Workspace'
).trim();

const config: CapacitorConfig = {
  appId: resolvedAppId,
  appName: resolvedAppName,
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
