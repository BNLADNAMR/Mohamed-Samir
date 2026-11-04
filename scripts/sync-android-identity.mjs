import fs from 'node:fs';
import path from 'node:path';

const identityPath = path.resolve('app-identity.json');
if (!fs.existsSync(identityPath)) {
  console.log('app-identity.json not found — skipping identity sync.');
  process.exit(0);
}

const rawIdentity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
const appId = String(process.env.CAP_APP_ID || rawIdentity.appId || 'com.workspace.shifttracker').trim();
const appName = String(process.env.CAP_APP_NAME || rawIdentity.appName || 'Shift Workspace').trim();
const versionName = String(rawIdentity.versionName || '1.0.0').trim();
const versionCode = Math.max(1, Number(rawIdentity.versionCode) || 1);

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

const stringsXmlPath = path.resolve('android/app/src/main/res/values/strings.xml');
if (fs.existsSync(stringsXmlPath)) {
  const xmlSafeName = escapeXml(appName);
  const xmlSafeId = escapeXml(appId);
  const nextStringsXml = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${xmlSafeName}</string>
    <string name="title_activity_main">${xmlSafeName}</string>
    <string name="package_name">${xmlSafeId}</string>
    <string name="custom_url_scheme">${xmlSafeId}</string>
</resources>
`;
  fs.writeFileSync(stringsXmlPath, nextStringsXml, 'utf8');
}

const appBuildGradlePath = path.resolve('android/app/build.gradle');
if (fs.existsSync(appBuildGradlePath)) {
  let gradle = fs.readFileSync(appBuildGradlePath, 'utf8');
  gradle = gradle.replace(/applicationId\s+"[^"]+"/, `applicationId "${appId}"`);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  fs.writeFileSync(appBuildGradlePath, gradle, 'utf8');
}

console.log(
  `Synced Android identity -> appName="${appName}", applicationId="${appId}", v${versionName} (${versionCode})`
);
