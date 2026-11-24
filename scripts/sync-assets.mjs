import { mkdirSync, copyFileSync } from 'node:fs';
// Hand-written legacy screens. React screens (guide.js, intake.js, impact.js, drafting.js, templates.js, workspace.js, resolution.js, shared.js) are written to frontend/public by Vite.
mkdirSync('frontend/public', { recursive: true });
for (const file of ['index.html', 'app.js', 'app.css', 'workflow.css', 'assurance.css', 'resolution.css', 'logo.svg'])
    copyFileSync(`frontend/legacy/${file}`, `frontend/public/${file}`);
console.log('Legacy assets synchronised from frontend/legacy/ to frontend/public/; no runtime secrets copied.');
