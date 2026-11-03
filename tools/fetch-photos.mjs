// Runs on GitHub Actions (the dev sandbox can't reach Unsplash). Downloads each
// photo listed in tools/photos.json via Unsplash's download endpoint.
import fs from 'node:fs';
const list = JSON.parse(fs.readFileSync('tools/photos.json', 'utf8'));
fs.mkdirSync('photos-raw', { recursive: true });
const report = [];
for (const p of list) {
  const url = `https://unsplash.com/photos/${p.id}/download?force=true&w=1400`;
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MindLyte-build/1.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ok = r.ok && buf.length > 20000;
    if (ok) fs.writeFileSync(`photos-raw/${p.id}.jpg`, buf);
    report.push(`${p.id} ${r.status} ${buf.length} ${r.url} acao=${r.headers.get('access-control-allow-origin')}`);
  } catch (e) { report.push(`${p.id} ERR ${e.message}`); }
}
// Also record whether the redirecting endpoint itself sends CORS headers.
try {
  const r = await fetch(`https://unsplash.com/photos/${list[0].id}/download?w=800`, { redirect: 'manual' });
  report.push(`redirect-hop status=${r.status} acao=${r.headers.get('access-control-allow-origin')}`);
} catch (e) { report.push('redirect-hop ERR ' + e.message); }
fs.writeFileSync('photos-raw/report.txt', report.join('\n') + '\n');
console.log(report.join('\n'));
