import { mkdirSync, copyFileSync } from 'node:fs';
// Static files for the web root. The app itself (app.js) is written to frontend/public by Vite.
mkdirSync('frontend/public', { recursive: true });
for (const file of ['index.html', 'app.css', 'workflow.css', 'assurance.css', 'resolution.css', 'logo.svg'])
    copyFileSync(`frontend/static/${file}`, `frontend/public/${file}`);
console.log('Static assets synchronised from frontend/static/ to frontend/public/; no runtime secrets copied.');
