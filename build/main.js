/* IA do zero — assistente de programação com rede neural própria.
   Rede neural (Matrix + Network com Adam) + parser de JS + base de conhecimento.
   Memória persistente em localStorage: os pesos e o treino não somem ao recarregar.
*/
import { Trainer } from './ai/trainer.js';
import { Network } from './ai/network.js';
import { getSNIPPETS, LABELS } from './ai/dataset.js';
import { extractFeatures, classifyHeuristic, tokenize } from './ai/parser.js';
import { detectLanguage, CONCEPTS, findConcept } from './ai/knowledge.js';
import { Visualizer } from './ai/visualizer.js';

const snippets = getSNIPPETS();
const dataset = snippets.map((s) => ({
  input: extractFeatures(s).featureVector,
  target: oneHot(classifyHeuristic(s), 4),
  snippet: s,
  label: classifyHeuristic(s),
}));

function oneHot(index, size) {
  return Array.from({ length: size }, (_, i) => (i === index ? 1 : 0));
}

const trainer = new Trainer({
  layerSizes: [16, 16, 16, 4],
  lr: 0.001,
});

const $ = (id) => document.getElementById(id);

// ---------- elementos ----------
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel-view');

const trainBtn = $('trainBtn');
const stepBtn = $('stepBtn');
const resetBtn = $('resetBtn');
const saveBtn = $('saveBtn');
const loadBtn = $('loadBtn');
const exportBtn = $('exportBtn');
const importFile = $('importFile');
const importBtn = $('importBtn');
const clearMemBtn = $('clearMemBtn');

const sendBtn = $('sendBtn');
const chatInput = $('chatInput');
const chatMessages = $('chatMessages');

const snippetInput = $('snippetInput');
const predictBtn = $('predictBtn');
const analyzeBtn = $('analyzeBtn');

const epochDisplay = $('epoch');
const errorDisplay = $('error');
const trainedDisplay = $('trained');
const resultDisplay = $('result');
const logDisplay = $('log');
const confContainer = $('confidence');

const chart = $('chart');
const cctx = chart.getContext('2d');
const netCanvas = $('netCanvas');
const heatCanvas = $('heatCanvas');
const confCanvas = $('confCanvas');
const layerSelect = $('layerSelect');

let running = false;
let raf = null;
let lastPrediction = null;
let visualizer = new Visualizer(netCanvas, heatCanvas, confCanvas);

// ---------- utils ----------
function log(msg) {
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logDisplay.prepend(line);
}

function updateStats() {
  epochDisplay.textContent = trainer.epoch;
  const last = trainer.history[trainer.history.length - 1];
  errorDisplay.textContent = last ? last.error.toFixed(6) : '-';
  trainedDisplay.textContent = trainer.totalTrained;
}

function drawChart() {
  const { history } = trainer;
  const w = chart.width;
  const h = chart.height;
  cctx.clearRect(0, 0, w, h);
  if (history.length < 2) return;

  cctx.strokeStyle = '#6ee7b7';
  cctx.lineWidth = 2;
  cctx.beginPath();
  const maxErr = Math.max(...history.map((e) => e.error), 0.1);
  const stepX = w / Math.max(history.length - 1, 1);
  history.forEach((e, i) => {
    const x = i * stepX;
    const y = h - (e.error / maxErr) * (h - 32) - 16;
    if (i === 0) cctx.moveTo(x, y);
    else cctx.lineTo(x, y);
  });
  cctx.stroke();

  cctx.fillStyle = '#94a3b8';
  cctx.font = '10px monospace';
  cctx.fillText(`erro: ${history[history.length - 1].error.toFixed(4)}`, 6, h - 6);
  cctx.fillText(`épocas: ${history.length}`, w - 70, h - 6);
}

function drawNetwork(activationsSnapshot = null) {
  visualizer.drawNetwork(trainer.network, activationsSnapshot);
}

function drawHeatmap() {
  const layerIdx = parseInt(layerSelect.value, 10);
  const layer = trainer.network.layers[layerIdx];
  visualizer.drawHeatmap(layer.w);
}

function drawConfidence(probs, classIdx) {
  confContainer.innerHTML = '';
  if (!probs) return;
  LABELS.forEach((label, i) => {
    const bar = document.createElement('div');
    bar.className = 'conf-bar';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.className = 'conf-label';
    const fill = document.createElement('div');
    fill.className = 'conf-fill';
    const val = document.createElement('span');
    val.textContent = ((probs[i] || 0) * 100).toFixed(1) + '%';
    val.className = 'conf-val';
    bar.appendChild(labelEl);
    bar.appendChild(fill);
    bar.appendChild(val);
    confContainer.appendChild(bar);
  });
  // anima preenchimento
  requestAnimationFrame(() => {
    document.querySelectorAll('.conf-fill').forEach((el, idx) => {
      el.classList.add('filled');
    });
  });
}

// ---------- treinamento ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function trainBatch(n = 20) {
  const data = shuffle([...dataset]);
  for (let i = 0; i < n; i++) {
    trainer.trainEpoch(data);
  }
  updateStats();
  drawChart();
  drawNetwork();
  drawHeatmap();
}

trainBtn.addEventListener('click', () => {
  running = true;
  trainBtn.disabled = true;
  stepBtn.disabled = true;
  log('treino contínuo iniciado');
  loop();
});

stepBtn.addEventListener('click', () => {
  trainBatch(10);
  log(`treino: +10 épocas (total ${trainer.epoch})`);
});

resetBtn.addEventListener('click', () => {
  running = false;
  trainer.reset();
  updateStats();
  drawChart();
  drawNetwork();
  drawHeatmap();
  log('memória da IA resetada (pesos apagados)');
  trainBtn.disabled = false;
  stepBtn.disabled = false;
});

saveBtn.addEventListener('click', () => {
  trainer.save();
  log('memória salva no navegador (localStorage)');
});

loadBtn.addEventListener('click', () => {
  // já carrega no construtor, mas forçamos recarregar
  const raw = localStorage.getItem('ia_memoria_v2');
  if (!raw) { log('nenhuma memória salva'); return; }
  try {
    const payload = JSON.parse(raw);
    trainer.network = Network.fromJSON(payload.network);
    trainer.epoch = payload.epoch || 0;
    trainer.lr = payload.lr || 0.001;
    trainer.history = payload.history || [];
    trainer.totalTrained = payload.totalTrained || 0;
    updateStats();
    drawChart();
    drawNetwork();
    drawHeatmap();
    log('memória recarregada do navegador');
  } catch (e) {
    log('falha ao carregar memória: ' + e.message);
  }
});

exportBtn.addEventListener('click', () => {
  const json = trainer.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ia_memoria.json';
  a.click();
  URL.revokeObjectURL(url);
  log('memória exportada para ia_memoria.json');
});

importBtn.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (trainer.importJSON(ev.target.result)) {
      updateStats();
      drawChart();
      drawNetwork();
      drawHeatmap();
      log('memória importada com sucesso');
    } else {
      log('falha ao importar memória');
    }
  };
  reader.readAsText(file);
});

clearMemBtn.addEventListener('click', () => {
  if (!confirm('apagar toda a memória da IA (pesos e treino)?')) return;
  trainer.reset();
  updateStats();
  drawChart();
  drawNetwork();
  drawHeatmap();
  log('memória apagada');
});

function loop() {
  if (!running) {
    trainBtn.disabled = false;
    stepBtn.disabled = false;
    return;
  }
  trainBatch(10);
  raf = requestAnimationFrame(loop);
}

// ---------- previsão de código ----------
import { Matrix } from './ai/matrix.js';

predictBtn.addEventListener('click', () => {
  const snippet = snippetInput.value.trim();
  if (!snippet) return;
  doPredict(snippet);
});

snippetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const snippet = snippetInput.value.trim();
    if (snippet) doPredict(snippet);
  }
});

function doPredict(snippet) {
  const input = extractFeatures(snippet).featureVector;
  const pred = trainer.network.predict(input);
  lastPrediction = { input, probs: pred.probs, classIdx: pred.classIdx, snippet };

  resultDisplay.textContent = `${snippet} → ${LABELS[pred.classIdx]}`;
  resultDisplay.className = 'prediction';
  drawConfidence(pred.probs, pred.classIdx);

  // captura ativações por camada
  const acts = [];
  let a = Matrix.fromArray(input);
  acts.push(a);
  for (const layer of trainer.network.layers) {
    const z = Matrix.add(Matrix.multiply(layer.w, a), layer.b);
    a = Matrix.map(z, layer.activation.fn);
    acts.push(a);
  }
  drawNetwork(acts);
  log(`previsão: ${LABELS[pred.classIdx]} | confiança ${(Math.max(...pred.probs) * 100).toFixed(1)}%`);
}

// ---------- chat com a IA ----------
function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = 'message ' + who;
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  div.appendChild(content);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function botTyping() {
  const div = document.createElement('div');
  div.className = 'message bot typing';
  div.id = 'typing';
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = 'digitando...';
  div.appendChild(content);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function removeTyping() {
  const t = $('typing');
  if (t) t.remove();
}

function buildSystemPrompt() {
  return `Você é uma IA de programação escrita do zero (rede neural própria, sem biblioteca externa).
Sua memória (pesos da rede) está salva no navegador do usuário.
Responda em português, de forma direta e útil, focada em programação.
Se não souber algo, diga que está aprendendo e pode ser treinado com exemplos.`;
}

function generateReply(userMsg) {
  // 1. tenta reconhecer conceito da base de conhecimento
  const concept = findConcept(userMsg);
  if (concept) {
    return concept;
  }

  // 2. se é código, classifica e dá dica
  const trimmed = userMsg.trim();
  if (/[{}\(\);]/.test(trimmed) || /function|const |let |for |if |while /.test(trimmed)) {
    const lang = detectLanguage(trimmed);
    const pred = trainer.predictSnippet(trimmed);
    let reply = `Analisei seu trecho (${lang}).\n`;
    reply += `A rede neural classifica como: ${LABELS[pred.classIdx]}\n`;
    reply += `Confiança: ${(Math.max(...pred.probs) * 100).toFixed(1)}%\n`;
    reply += `Sugestão de treino: me envie mais exemplos como este e clique em "treinar" para a IA aprender.`;
    return reply;
  }

  // 3. resposta genérica de aprendizado
  const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'eaí'];
  const low = userMsg.toLowerCase();
  if (greetings.some((g) => low.includes(g))) {
    return 'Oi! Sou sua IA de programação. Pode colar código aqui que eu analiso, ou me perguntar sobre variáveis, funções, laços, condicionais, arrays, promises e APIs. Quer treinar a IA? Use a aba "treino".';
  }

  return 'Estou aprendendo ainda. Tente me mostrar um trecho de código ou perguntar sobre um conceito de programação (variável, função, laço, condicional, array, promise, api, debug, complexidade).';
}

sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  chatInput.value = '';
  const typing = botTyping();
  setTimeout(() => {
    removeTyping();
    const reply = generateReply(text);
    addMessage(reply, 'bot');
  }, 600);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// ---------- analisar código estático ----------
analyzeBtn.addEventListener('click', () => {
  const code = snippetInput.value.trim();
  if (!code) return;
  const m = maintainability(code);
  const pred = trainer.predictSnippet(code);

  let html = `<div class="analysis-card">
    <div class="analysis-row"><span class="label">classe (rede neural)</span><span class="value">${LABELS[pred.classIdx]}</span></div>
    <div class="analysis-row"><span class="label">confiança</span><span class="value">${(Math.max(...pred.probs) * 100).toFixed(1)}%</span></div>
    <div class="analysis-row"><span class="label">complexidade ciclomática</span><span class="value">${m.complexity.cyclomatic}</span></div>
    <div class="analysis-row"><span class="label">pontos de decisão</span><span class="value">${m.complexity.decisions}</span></div>
    <div class="analysis-row"><span class="label">profundidade máxima</span><span class="value">${m.complexity.maxDepth}</span></div>
    <div class="analysis-row"><span class="label">tokens</span><span class="value">${m.complexity.tokens}</span></div>
    <div class="analysis-row"><span class="label">manutenibilidade</span><span class="value grade-${m.grade.toLowerCase()}">${m.score} — ${m.grade}</span></div>
  </div>`;

  if (m.bugs.length) {
    html += `<div class="bugs"><strong>padrões suspeitos (${m.bugs.length}):</strong><ul>`;
    m.bugs.forEach((b) => {
      html += `<li>linha ${b.line}: ${b.message}</li>`;
    });
    html += `</ul></div>`;
  } else {
    html += `<div class="bugs"><strong>padrões suspeitos:</strong> nenhum detectado.</div>`;
  }

  // mostrar na área de resultado do treino (ou criar um output dedicado)
  resultDisplay.innerHTML = html;
  resultDisplay.className = '';
  drawConfidence(pred.probs, pred.classIdx);
  log(`análise estática: ${m.complexity.tokens} tokens, complexidade ${m.complexity.cyclomatic}, ${m.bugs.length} padrão(s)`);
});

// ---------- tabs ----------
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    $(view).classList.add('active');
    if (view === 'view-train') {
      drawChart();
      drawNetwork();
      drawHeatmap();
    } else if (view === 'view-net') {
      drawNetwork();
      drawHeatmap();
    } else if (view === 'view-conf') {
      drawConfidence(lastPrediction ? lastPrediction.probs : null, lastPrediction ? lastPrediction.classIdx : null);
    }
  });
});

// ---------- init ----------
updateStats();
drawChart();
drawNetwork();
drawHeatmap();
log('IA inicializada. Memória carregada do navegador.');
log(`épocas treinadas: ${trainer.epoch} | amostras processadas: ${trainer.totalTrained}`);
log('digite código na barra de busca ou use o chat para conversar.');

// expose pra console
window.__ia = { trainer, dataset, extractFeatures, classifyHeuristic, predictSnippet: (s) => trainer.predictSnippet(s) };
