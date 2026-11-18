import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('public', { recursive: true });
for (const file of ['index.html', 'app.js', 'app.css', 'workflow.css', 'assurance.css', 'resolution.js', 'intake.js', 'guide.js', 'drafting.js', 'resolution.css', 'logo.svg'])
    copyFileSync(`web/${file}`, `public/${file}`);
console.log('Public assets synchronised from web/; no runtime secrets copied.');
