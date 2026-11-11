/* Base de conhecimento de programação embutida na IA.
   Esta é a "memória" da IA: conceitos, exemplos e respostas prontas.
   É gravada no localStorage junto com os pesos e não some ao recarregar.
*/

const LANGUAGE_MAP = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.py': 'Python',
  '.java': 'Java',
  '.cpp': 'C++',
  '.c': 'C',
  '.cs': 'C#',
  '.go': 'Go',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
};

function detectLanguage(code) {
  for (const ext of Object.keys(LANGUAGE_MAP)) {
    // heurística simples por conteúdo
  }
  const s = code.toLowerCase();
  if (/function\s*\w+\s*\(|const |let |=>|document\.|require\(|module\.exports/.test(s)) return 'JavaScript';
  if (/def \w+|import |print\(|from \w+ import/.test(s)) return 'Python';
  if (/public\s+(static\s+)?\w+\s+\w+\s*\(|class \w+/.test(s)) return 'Java';
  if (/#include|int main|printf\(/.test(s)) return 'C/C++';
  if (/fn \w+|let mut|impl /.test(s)) return 'Rust';
  if (/func \w+|package |import /.test(s)) return 'Go';
  return 'texto';
}

const CONCEPTS = {
  'variável': 'Uma variável é um nome que armazena um valor na memória. Em JavaScript use `let` (reassignível) ou `const` (imutável). Evite `var`.',
  'função': 'Função é um bloco de código reutilizável que recebe parâmetros e pode retornar um valor. Ex: `function soma(a, b) { return a + b; }`',
  'laço': 'Laço repete um bloco de código. `for` para repetições com contador, `while` enquanto uma condição for verdadeira.',
  'condicional': 'Condicional executa código apenas se uma condição for verdadeira. `if`, `else if`, `else`. Em JS também existe `switch` e operador ternário.',
  'array': 'Array é uma lista ordenada de valores. Em JS: `const lista = [1, 2, 3];`. Métodos úteis: `map`, `filter`, `reduce`, `forEach`.',
  'objeto': 'Objeto armazena pares chave-valor. Ex: `const usuario = { nome: "João", idade: 25 };`. Acesso via `.nome` ou `[nome]`.',
  'promise': 'Promise representa um valor que estará disponível no futuro (assíncrono). Use `.then()` ou `async/await`.',
  'api': 'API é uma interface para comunicação entre sistemas. No front-end usa `fetch()` para consumir APIs REST.',
  'debug': 'Debug é o processo de encontrar e corrigir erros. Use `console.log`, breakpoints do navegador e o try/catch.',
  'complexidade': 'Complexidade de tempo (Big O) mede quanto o tempo de execução cresce com o tamanho da entrada. O(1) constante, O(n) linear, O(n²) quadrático.',
};

function findConcept(message) {
  const s = message.toLowerCase();
  for (const key of Object.keys(CONCEPTS)) {
    if (s.includes(key)) return CONCEPTS[key];
  }
  return null;
}

export { detectLanguage, CONCEPTS, findConcept };
