import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('frontend/public', { recursive: true });
for (const file of ['index.html', 'app.js', 'app.css', 'workflow.css', 'assurance.css', 'resolution.js', 'intake.js', 'guide.js', 'drafting.js', 'impact.js', 'templates.js', 'resolution.css', 'logo.svg'])
    copyFileSync(`frontend/src/${file}`, `frontend/public/${file}`);
console.log('Public assets synchronised from frontend/src/ to frontend/public/; no runtime secrets copied.');
