/* Parser/tokenizador de código JavaScript feito na mão.
   Extrai features reais de um trecho de código (não só heurística de regex):
   contagem de tokens por tipo, profundidade de blocos, variáveis, funções,
   laços, conditionais, retorno, operadores, etc.
*/

const KEYWORDS = new Set([
  'let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch',
  'throw', 'class', 'extends', 'new', 'this', 'typeof', 'instanceof', 'in',
  'of', 'async', 'await', 'yield', 'import', 'export', 'delete', 'void',
]);

const OPERATORS = new Set([
  '+', '-', '*', '/', '%', '++', '--', '==', '===', '!=', '!==', '>', '<',
  '>=', '<=', '&&', '||', '!', '~', '&', '|', '^', '<<', '>>', '>>>', '+=',
  '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '=', '?:',
  '?', ':', '=>', '=>',
]);

const PUNCTUATION = new Set(['(', ')', '{', '}', '[', ']', ';', ',', '.']);

function tokenize(code) {
  const tokens = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];

    // whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // comentário de linha
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      tokens.push({ type: 'comment', value: code.slice(i, end === -1 ? code.length : end) });
      i = end === -1 ? code.length : end + 1;
      continue;
    }
    // comentário de bloco
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i);
      tokens.push({ type: 'comment', value: code.slice(i, end === -1 ? code.length : end + 2) });
      i = end === -1 ? code.length : end + 2;
      continue;
    }

    // string
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let str = '';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') { i++; if (i < code.length) str += code[i++]; else str += '\\'; continue; }
        str += code[i++];
      }
      if (i < code.length) i++; // fecha aspas
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // número
    if (/\d/.test(ch)) {
      let num = '';
      while (i < code.length && (/[\dx.]/.test(code[i]) || code[i] === 'e' || code[i] === 'E' || code[i] === '+' || code[i] === '-')) {
        num += code[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // identificador / palavra-chave
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = '';
      while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) {
        ident += code[i++];
      }
      tokens.push({ type: KEYWORDS.has(ident) ? 'keyword' : 'identifier', value: ident });
      continue;
    }

    // operadores de 2 chars primeiro
    const two = ch + code[i + 1];
    if (OPERATORS.has(two)) {
      tokens.push({ type: 'operator', value: two });
      i += 2;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    // pontuação
    if (PUNCTUATION.has(ch)) {
      tokens.push({ type: 'punctuation', value: ch });
      i++;
      continue;
    }

    // desconhecido: pula
    i++;
  }
  return tokens;
}

function extractFeatures(code) {
  const tokens = tokenize(code);

  const counts = {
    keyword: 0, identifier: 0, operator: 0, punctuation: 0,
    string: 0, number: 0, comment: 0,
  };
  let letCount = 0, constCount = 0, varCount = 0;
  let funcCount = 0, returnCount = 0;
  let ifCount = 0, elseCount = 0;
  let forCount = 0, whileCount = 0;
  let switchCount = 0, tryCount = 0;
  let openBraces = 0, maxDepth = 0, depth = 0;
  let arrowCount = 0;

  for (const t of tokens) {
    counts[t.type]++;
    const v = t.value;
    if (t.type === 'keyword') {
      if (v === 'let') letCount++;
      else if (v === 'const') constCount++;
      else if (v === 'var') varCount++;
      else if (v === 'function') funcCount++;
      else if (v === 'return') returnCount++;
      else if (v === 'if') ifCount++;
      else if (v === 'else') elseCount++;
      else if (v === 'for') forCount++;
      else if (v === 'while') whileCount++;
      else if (v === 'switch') switchCount++;
      else if (v === 'try') tryCount++;
    }
    if (v === '=>') arrowCount++;
    if (v === '{') {
      depth++;
      openBraces++;
      if (depth > maxDepth) maxDepth = depth;
    }
    if (v === '}') depth = Math.max(0, depth - 1);
  }

  const total = tokens.length || 1;
  const featureVector = [
    counts.keyword / total,
    counts.identifier / total,
    counts.operator / total,
    counts.punctuation / total,
    counts.string / total,
    counts.number / total,
    (letCount + constCount + varCount) / total,
    funcCount / total,
    returnCount / total,
    (ifCount + elseCount) / total,
    (forCount + whileCount) / total,
    switchCount / total,
    tryCount / total,
    arrowCount / total,
    maxDepth / 10,
    openBraces / 20,
  ];

  return { featureVector, tokens, counts, maxDepth };
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

export { tokenize, extractFeatures, classifyHeuristic, KEYWORDS, OPERATORS };
