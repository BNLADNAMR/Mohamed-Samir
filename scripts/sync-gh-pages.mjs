import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const distDir = path.resolve('dist');
const publicDir = path.resolve('public');
const distIndexPath = path.join(distDir, 'index.html');
const dist404Path = path.join(distDir, '404.html');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. مزامنة 404.html كنسخة مطابقة لـ index.html لتوجيه مسارات SPA
if (fs.existsSync(distIndexPath)) {
  fs.copyFileSync(distIndexPath, dist404Path);
}

// 2. نسخ .htaccess إلى مجلد dist
const publicHtaccess = path.join(publicDir, '.htaccess');
const distHtaccess = path.join(distDir, '.htaccess');
if (fs.existsSync(publicHtaccess)) {
  fs.copyFileSync(publicHtaccess, distHtaccess);
}

// 3. إنشاء .nojekyll
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

// 4. حزم مجلد dist في ملف zip واحد لتنزيله ورفعه إلى InfinityFree
try {
  const zipPath = path.resolve('dist-package.zip');
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  execSync('zip -r -q ../dist-package.zip .', { cwd: distDir });
  
  // نسخ الحزمة إلى مجلد المخرجات artifacts إن وجد
  const artifactDir = '/.aistudio/artifacts/brain/ebbc2e4e-1c19-4292-8812-3bd5778a6fbf';
  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(zipPath, path.join(artifactDir, 'dist_static_web_infinityfree.zip'));
  }
  console.log('Successfully prepared production static bundle in dist/ and generated dist-package.zip.');
} catch (err) {
  console.warn('Zip creation note:', err.message);
}
