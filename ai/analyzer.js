/* Analisador estático de código: complexidade ciclomática + padrões suspeitos.
   Feito na mão, sem biblioteca externa.
*/

import { tokenize } from './parser.js';

function complexity(code) {
  const tokens = tokenize(code);
  let decisions = 0;
  let depth = 0;
  let maxDepth = 0;

  for (const t of tokens) {
    const v = t.value;
    if (t.type === 'keyword' && (v === 'if' || v === 'else if' || v === 'case')) decisions++;
    if (v === 'for' || v === 'while' || v === 'do' || v === 'catch') decisions++;
    if (v === '{') {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
    if (v === '}') depth = Math.max(0, depth - 1);
  }

  return {
    decisions,
    maxDepth,
    cyclomatic: decisions + 1,
    tokens: tokens.length,
  };
}

function bugPatterns(code) {
  const issues = [];
  const lines = code.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const num = idx + 1;
    if (/\b==[^=]/.test(trimmed) && !/===/.test(trimmed)) {
      issues.push({ line: num, type: 'loose-equality', message: 'use === ao invés de ==' });
    }
    if (/\bvar\b/.test(trimmed)) {
      issues.push({ line: num, type: 'var-decl', message: 'prefira let/const sobre var' });
    }
    if (/\beval\s*\(/.test(trimmed)) {
      issues.push({ line: num, type: 'eval', message: 'eval() é perigoso e de difícil otimização' });
    }
    if (/console\.log\(.*['"]\s*(debug|temp|test|foo|bar)/i.test(trimmed)) {
      issues.push({ line: num, type: 'debug-log', message: 'possível log de debug deixado no código' });
    }
    if (/\bfor\s*\(.*;\s*.*;\s*$/i.test(trimmed) && !/\{\s*$/.test(trimmed)) {
      issues.push({ line: num, type: 'empty-loop-body', message: 'for com corpo vazio (possível ponto-e-vírgula esquecido)' });
    }
  });

  return issues;
}

function maintainability(code) {
  const c = complexity(code);
  const bugs = bugPatterns(code);
  let score = 100;
  score -= c.decisions * 5;
  score -= Math.max(0, c.maxDepth - 2) * 10;
  score -= bugs.length * 4;
  score = Math.max(0, Math.min(100, score));

  let grade;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return { score, grade, complexity: c, bugs, suggestions: bugs.map((b) => b.message) };
}

export { complexity, bugPatterns, maintainability };
