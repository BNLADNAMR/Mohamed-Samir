import fs from 'node:fs';
import path from 'node:path';

const identityPath = path.resolve('app-identity.json');
if (fs.existsSync(identityPath)) {
  const data = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  console.log('Synchronized Android app identity:', data.applicationId);
}
