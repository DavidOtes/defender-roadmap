// Rotates quiz option lists so correct answers are spread evenly across positions 0-3.
// Skips any question whose explanation refers to options by position/letter.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'secplus');
const files = fs.readdirSync(dir).filter(f => /^d\d[ab]?\.json$/.test(f));
const positional = /\b(option|answer|choice)\s+[A-D]\b|\b(first|second|third|fourth|last)\s+(option|answer|choice)\b/i;
let counts = [0, 0, 0, 0], skipped = 0, total = 0;
const rot = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
for (const f of files) {
  const p = path.join(dir, f); const d = JSON.parse(fs.readFileSync(p, 'utf8')); let i = 0;
  for (const o of d.objectives) for (const v of o.videos) for (const q of v.quiz) {
    total++;
    if (positional.test(q.explain) || q.options.length !== 4) { skipped++; counts[q.answer]++; continue; }
    const target = i++ % 4;           // deterministic round-robin per file
    const k = (q.answer - target + 4) % 4;   // rotate left by k so answer lands on target
    q.options = rot(q.options, k); q.answer = target; counts[target]++;
  }
  fs.writeFileSync(p, JSON.stringify(d));
}
console.log('questions', total, 'skipped(positional)', skipped, 'answer positions', counts.join('/'));
