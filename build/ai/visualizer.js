/* Visualizações: rede neural, heatmap de pesos, matriz de confusão. */

class Visualizer {
  constructor(netCanvas, heatCanvas, confCanvas) {
    this.netCanvas = netCanvas;
    this.netCtx = netCanvas.getContext('2d');
    this.heatCanvas = heatCanvas;
    this.heatCtx = heatCanvas.getContext('2d');
    this.confCanvas = confCanvas;
    this.confCtx = confCanvas.getContext('2d');
  }

  drawNetwork(network, inputActivations = null) {
    const { layers } = network;
    const w = this.netCanvas.width;
    const h = this.netCanvas.height;
    const ctx = this.netCtx;
    ctx.clearRect(0, 0, w, h);

    const layerSizes = [network.layerSizes[0], ...layers.map((l) => l.outputSize)];
    const positions = layerSizes.map((size, li) => {
      const ys = [];
      const padding = 45;
      const stepY = (h - 2 * padding) / Math.max(size - 1, 1);
      for (let i = 0; i < size; i++) {
        const x = padding + (li / Math.max(layerSizes.length - 1, 1)) * (w - 2 * padding);
        const y = padding + i * stepY;
        ys.push({ x, y });
      }
      return ys;
    });

    const labelNames = ['entrada', ...layers.map((_, i) => `oculta ${i + 1}`), 'saída'];

    // conexões com pesos
    layers.forEach((layer, li) => {
      const from = positions[li];
      const to = positions[li + 1];
      for (let i = 0; i < from.length; i++) {
        for (let j = 0; j < to.length; j++) {
          const weight = layer.w.data[j][i];
          const abs = Math.abs(weight);
          const opacity = Math.min(abs * 2, 1);
          ctx.beginPath();
          ctx.moveTo(from[i].x, from[i].y);
          ctx.lineTo(to[j].x, to[j].y);
          ctx.strokeStyle = weight >= 0
            ? `rgba(110,231,183,${opacity * 0.45})`
            : `rgba(248,113,113,${opacity * 0.45})`;
          ctx.lineWidth = 0.4 + abs * 3;
          ctx.stroke();
        }
      }
    });

    // nós com ativação
    positions.forEach((layer, li) => {
      layer.forEach((node, ni) => {
        let active = 0.5;
        if (inputActivations && inputActivations[li]) {
          active = inputActivations[li].data[ni] ? inputActivations[li].data[ni][0] : 0.5;
          active = Math.min(Math.max(active, 0), 1);
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(110,231,183,${0.15 + active * 0.85})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(110,231,183,${0.3 + active * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // bias
        const b = layers[li] ? (layers[li].b.data[ni] ? layers[li].b.data[ni][0] : 0) : 0;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = b >= 0 ? '#6ee7b7' : '#f87171';
        ctx.fill();
      });
    });

    // rótulos
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    positions.forEach((layer, li) => {
      ctx.fillText(labelNames[li], layer[0].x - 16, 24);
    });
  }

  drawHeatmap(matrix) {
    const ctx = this.heatCtx;
    const w = this.heatCanvas.width;
    const h = this.heatCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const rows = matrix.rows;
    const cols = matrix.cols;
    const cellW = w / cols;
    const cellH = h / rows;

    let maxAbs = 0;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        maxAbs = Math.max(maxAbs, Math.abs(matrix.data[i][j]));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = matrix.data[i][j];
        const intensity = maxAbs === 0 ? 0 : Math.abs(v) / maxAbs;
        ctx.fillStyle = v >= 0
          ? `rgba(110,231,183,${0.15 + intensity * 0.85})`
          : `rgba(248,113,113,${0.15 + intensity * 0.85})`;
        ctx.fillRect(j * cellW, i * cellH, cellW, cellH);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let j = 0; j <= cols; j++) {
      ctx.beginPath(); ctx.moveTo(j * cellW, 0); ctx.lineTo(j * cellW, h); ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(w, i * cellH); ctx.stroke();
    }
  }

  drawConfusion(confusionMatrix, labels) {
    const ctx = this.confCtx;
    const w = this.confCanvas.width;
    const h = this.confCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const n = labels.length;
    const cellW = w / n;
    const cellH = h / n;

    let maxVal = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        maxVal = Math.max(maxVal, confusionMatrix[i][j]);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = confusionMatrix[i][j];
        const intensity = maxVal === 0 ? 0 : v / maxVal;
        ctx.fillStyle = `rgba(110,231,183,${0.15 + intensity * 0.85})`;
        ctx.fillRect(j * cellW, i * cellH, cellW, cellH);
        ctx.fillStyle = '#f3f4f6';
        ctx.font = '11px monospace';
        ctx.fillText(v.toString(), j * cellW + cellW / 2 - 5, i * cellH + cellH / 2 + 4);
      }
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    labels.forEach((label, i) => {
      ctx.fillText(label, i * cellW + cellW / 2 - 22, h - 6);
      ctx.fillText(label, 4, i * cellH + cellH / 2 + 4);
    });
  }
}

export { Visualizer };
