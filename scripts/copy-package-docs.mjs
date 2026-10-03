// Copies the repo-level README/LICENSE/NOTICE into the package dir so the
// published tarball carries them (npm only packs files inside the package).
import { copyFileSync } from 'node:fs';
for (const f of ['README.md', 'LICENSE', 'NOTICE']) copyFileSync(new URL(`../${f}`, import.meta.url), f);
