/* Dataset sintético de programação (snippets JavaScript com rótulo heurístico).
   Serve como treino inicial. Cada amostra vira feature vector pelo parser real.
*/

const SNIPPETS = [
  'let x = 10;',
  'const y = x + 5;',
  'var name = "joao";',
  'let a = 1; let b = 2; let c = a + b;',
  'const data = [1, 2, 3];',
  'function soma(a, b) { return a + b; }',
  'const fn = (a) => a * 2;',
  'function calcular() { return total; }',
  'function init() { return 0; }',
  'const utils = { add: (a, b) => a + b };',
  'for (let i = 0; i < 10; i++) { console.log(i); }',
  'while (x > 0) { x--; }',
  'for (const item of items) { process(item); }',
  'if (x > 10) { console.log("alto"); } else { console.log("baixo"); }',
  'switch (status) { case 1: break; default: break; }',
  'if (ok) { return true; } return false;',
  'for (let i = 0; i < 5; i++) { if (i % 2 === 0) { continue; } }',
  'function validate() { if (ok) { return true; } return false; }',
  'function init() { for (let i = 0; i < n; i++) { if (ok) { return i; } } }',
  'function process() { for (let i = 0; i < list.length; i++) { if (list[i] > 0) { return list[i]; } } }',
  'try { doWork(); } catch (e) { log(e); }',
  'class Point { constructor(x, y) { this.x = x; this.y = y; } }',
  'async function fetchData() { const res = await fetch(url); return res.json(); }',
];

const LABELS = ['variável/atribuição', 'função', 'fluxo de controle', 'misto/complexo'];

export { SNIPPETS, LABELS };
export const getSNIPPETS = () => SNIPPETS;

export function getSnippets() {
  return SNIPPETS;
}

export function getRawDataset() {
  return SNIPPETS.map((snippet) => ({
    snippet,
    label: classifyHeuristic(snippet),
  }));
}

function classifyHeuristic(code) {
  const s = code.toLowerCase();
  const hasLoop = /for|while/.test(s);
  const hasCond = /if|else|switch/.test(s);
  const hasFunc = /function|=>/.test(s);
  if (hasFunc && (hasLoop || hasCond)) return 3;
  if (hasFunc) return 1;
  if (hasLoop || hasCond) return 2;
  return 0;
}

export { classifyHeuristic };
