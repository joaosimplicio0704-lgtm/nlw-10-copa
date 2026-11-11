/* IA do zero — aplicação completa.
   Modos: treino / analisar / playground.
   Rede neural escrita na mão (Matrix + Dense + Model + otimizadores),
   parser de código JS real, analisador de complexidade/bugs,
   visualização de pesos, heatmap e matriz de confusão.
*/
import { Trainer } from './ai/trainer.js';
import { Model } from './ai/model.js';
import { getSNIPPETS, LABELS, getRawDataset } from './ai/dataset.js';
import { extractFeatures, classifyHeuristic, tokenize } from './ai/parser.js';
import { complexity, bugPatterns, maintainability } from './ai/analyzer.js';
import { Visualizer } from './ai/visualizer.js';

const dataset = getRawDataset().map((d) => ({
  input: extractFeatures(d.snippet).featureVector,
  target: oneHot(d.label, 4),
  snippet: d.snippet,
  label: d.label,
}));

const trainer = new Trainer({
  layerSizes: [16, 16, 16, 4],
  activation: 'sigmoid',
  optimizer: 'adam',
  lr: 0.001,
});

const $ = (id) => document.getElementById(id);

// elementos UI
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel-view');
const trainBtn = $('trainBtn');
const stepBtn = $('stepBtn');
const resetBtn = $('resetBtn');
const saveBtn = $('saveBtn');
const loadBtn = $('loadBtn');
const predictBtn = $('predictBtn');
const analyzeBtn = $('analyzeBtn');
const snippetInput = $('snippetInput');
const codeInput = $('codeInput');
const epochDisplay = $('epoch');
const errorDisplay = $('error');
const resultDisplay = $('result');
const logDisplay = $('log');
const analysisOutput = $('analysisOutput');

const chart = $('chart');
const cctx = chart.getContext('2d');
const netCanvas = $('netCanvas');
const heatCanvas = $('heatCanvas');
const confCanvas = $('confCanvas');
const confContainer = $('confidence');
const layerSelect = $('layerSelect');

let running = false;
let raf = null;
let lastPrediction = null;
let visualizer = new Visualizer(netCanvas, heatCanvas, confCanvas);

// ---------- utils ----------

function oneHot(index, size) {
  return Array.from({ length: size }, (_, i) => (i === index ? 1 : 0));
}

function log(msg) {
  const line = document.createElement('div');
  line.textContent = msg;
  logDisplay.prepend(line);
}

function updateStats() {
  epochDisplay.textContent = trainer.epoch;
  const last = trainer.history[trainer.history.length - 1];
  errorDisplay.textContent = last ? last.error.toFixed(6) : '-';
}

function drawChart() {
  const { history } = trainer;
  const w = chart.width;
  const h = chart.height;
  cctx.clearRect(0, 0, w, h);
  if (history.length < 2) return;

  cctx.strokeStyle = '#00ff9d';
  cctx.lineWidth = 2;
  cctx.beginPath();
  const maxErr = Math.max(...history.map((e) => e.error), 0.1);
  const stepX = w / Math.max(history.length - 1, 1);
  history.forEach((e, i) => {
    const x = i * stepX;
    const y = h - (e.error / maxErr) * (h - 40) - 20;
    if (i === 0) cctx.moveTo(x, y);
    else cctx.lineTo(x, y);
  });
  cctx.stroke();

  cctx.fillStyle = '#888';
  cctx.font = '10px monospace';
  cctx.fillText(`erro: ${history[history.length - 1].error.toFixed(4)}`, 5, h - 5);
  cctx.fillText(`épocas: ${history.length}`, w - 60, h - 5);
}

function drawNetwork(activationsSnapshot = null) {
  visualizer.drawNetwork(trainer.model, activationsSnapshot);
}

function drawHeatmap() {
  const layerIdx = parseInt(layerSelect.value, 10);
  const layer = trainer.model.layers[layerIdx];
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
    fill.style.width = `${(probs[i] || 0) * 100}%`;
    fill.style.background = i === classIdx ? '#00ff9d' : '#232a30';
    const val = document.createElement('span');
    val.textContent = ((probs[i] || 0) * 100).toFixed(1) + '%';
    val.className = 'conf-val';
    bar.appendChild(labelEl);
    bar.appendChild(fill);
    bar.appendChild(val);
    confContainer.appendChild(bar);
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
  loop();
});

stepBtn.addEventListener('click', () => {
  trainBatch(10);
});

resetBtn.addEventListener('click', () => {
  running = false;
  trainer = new Trainer({
    layerSizes: [16, 16, 16, 4],
    activation: 'sigmoid',
    optimizer: 'adam',
    lr: 0.001,
  });
  updateStats();
  drawChart();
  drawNetwork();
  drawHeatmap();
  log('rede resetada');
  trainBtn.disabled = false;
  stepBtn.disabled = false;
});

saveBtn.addEventListener('click', () => {
  localStorage.setItem('ia_model', JSON.stringify(trainer.toJSON()));
  log('modelo salvo (pesos + épocas + histórico)');
});

loadBtn.addEventListener('click', () => {
  const raw = localStorage.getItem('ia_model');
  if (!raw) { log('nenhum modelo salvo'); return; }
  try {
    trainer = Trainer.fromJSON(JSON.parse(raw), {
      layerSizes: [16, 16, 16, 4],
      activation: 'sigmoid',
      optimizer: trainer.model.optimizerName,
      lr: trainer.model.lr,
    });
    updateStats();
    drawChart();
    drawNetwork();
    drawHeatmap();
    log('modelo carregado');
  } catch (e) {
    log('falha ao carregar: ' + e.message);
  }
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

// ---------- previsão / análise ----------

predictBtn.addEventListener('click', () => {
  const snippet = snippetInput.value.trim();
  if (!snippet) return;
  const input = extractFeatures(snippet).featureVector;
  const f = trainer.model.forward(Matrix.fromArray(input));
  const outputActivations = f;
  const arr = outputActivations.data.map((row) => row[0]);
  const classIdx = arr.indexOf(Math.max(...arr));
  lastPrediction = { input, probs: arr, classIdx, snippet };

  resultDisplay.textContent = `${snippet} → ${LABELS[classIdx]}`;
  resultDisplay.className = 'prediction';
  drawConfidence(arr, classIdx);

  // captura ativações por camada para visualizar
  const acts = [];
  let a = Matrix.fromArray(input);
  acts.push(a);
  for (const layer of trainer.model.layers) {
    const z = Matrix.add(Matrix.multiply(layer.w, a), layer.b);
    a = Matrix.map(z, layer.activation.fn);
    acts.push(a);
  }
  drawNetwork(acts);
  log(`previsão: ${LABELS[classIdx]} | confiança ${(Math.max(...arr) * 100).toFixed(1)}%`);
});

import { Matrix } from './ai/matrix.js';

analyzeBtn.addEventListener('click', () => {
  const code = codeInput.value.trim();
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

  analysisOutput.innerHTML = html;
  log(`análise: ${m.complexity.tokens} tokens, complexidade ${m.complexity.cyclomatic}, ${m.bugs.length} padrão(s) suspeito(s)`);
});

layerSelect.addEventListener('change', drawHeatmap);

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
log('IA pronta. rede: 16 → 16 → 16 → 4 | otimizador: Adam | entrada: 16 features reais do parser');
log('dataset: ' + dataset.length + ' snippets de programação');
