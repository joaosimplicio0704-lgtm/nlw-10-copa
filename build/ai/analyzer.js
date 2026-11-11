/* Analisador estático de código.
   Métricas de complexidade (estilo ciclomático simplificado) e detecção de
   padrões suspeitos (possíveis bugs) — tudo heurístico, feito na mão.
*/

import { tokenize, extractFeatures } from './parser.js';

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

  // complexidade ciclomática simplificada: decisões + 1
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

    if (/\bif\s*\(/.test(trimmed) && !/\{\s*$/.test(trimmed) && !/;\s*$/.test(trimmed)) {
      // if sem bloco na mesma linha é aceitável; ignore
    }
    if (/\b==[^=]/.test(trimmed) && !/===/.test(trimmed)) {
      issues.push({ line: num, type: 'loose-equality', message: 'use === ao invés de ==' });
    }
    if (/\bvar\b/.test(trimmed)) {
      issues.push({ line: num, type: 'var-decl', message: 'prefira let/const sobre var' });
    }
    if (/\beval\s*\(/.test(trimmed)) {
      issues.push({ line: num, type: 'eval', message: 'eval() é perigoso e de difícil otimização' });
    }
    if (/console\.(log|error|warn)/.test(trimmed) && /\/\/\s*todo/i.test(trimmed) === false) {
      // permitir, só marca se parecer leftovers
      if (/console\.log\(.*['"]\s*(debug|temp|test|foo|bar)/i.test(trimmed)) {
        issues.push({ line: num, type: 'debug-log', message: 'possível log de debug deixado no código' });
      }
    }
    if (trimmed.match(/\bfor\s*\(.*;\s*.*;\s*$/i) && !/\{\s*$/.test(trimmed)) {
      issues.push({ line: num, type: 'empty-loop-body', message: 'for com corpo vazio (possível ponto-e-vírgula esquecido)' });
    }
    if (/(function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}){10,}/.test(trimmed)) {
      issues.push({ line: num, type: 'long-line', message: 'linha muito complexa, considere quebrar' });
    }
    if (/\.length\s*==\s*0/.test(trimmed)) {
      issues.push({ line: num, type: 'length-check', message: 'use .length === 0 ou Array.isArray + vazio adequado' });
    }
  });

  // detectar variável usada antes de declarar (heurística simples, reserva)
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
