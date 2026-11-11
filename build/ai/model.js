/* Modelo sequencial: empilha camadas, treina com backprop completo.
   Substitui a Network antiga com API de camadas + otimizador.
*/

import { Matrix } from './matrix.js';
import { Activations } from './activations.js';
import { Dense } from './layer.js';
import { SGD, Adam, RMSprop } from './optimizer.js';

class Model {
  constructor(layerSizes, activation = 'sigmoid', optimizerName = 'adam', lr = 0.001) {
    this.layerSizes = layerSizes;
    this.layers = [];
    for (let i = 0; i < layerSizes.length - 1; i++) {
      this.layers.push(
        new Dense(layerSizes[i], layerSizes[i + 1], activation)
      );
    }

    const optMap = { sgd: new SGD(lr), adam: new Adam(lr), rmsprop: new RMSprop(lr) };
    this.optimizer = optMap[optimizerName] || optMap.adam;
    this.optimizerName = optimizerName;
    this.lr = lr;
    this.history = [];
  }

  forward(input) {
    let a = Matrix.fromArray(input);
    for (const layer of this.layers) {
      a = layer.forward(a);
    }
    return a;
  }

  predict(input) {
    const out = this.forward(input);
    const arr = Matrix.toArray(out);
    const probs = arr.map((v) => v);
    const classIdx = arr.indexOf(Math.max(...arr));
    return { classIdx, probs, output: out };
  }

  trainSample(input, target) {
    // forward
    let a = Matrix.fromArray(input);
    const activations = [a];
    const zs = [];
    for (const layer of this.layers) {
      const z = Matrix.add(Matrix.multiply(layer.w, a), layer.b);
      zs.push(z);
      a = Matrix.map(z, layer.activation.fn);
      activations.push(a);
    }

    const output = activations[activations.length - 1];
    const targetMatrix = new Matrix(output.rows, 1);
    for (let i = 0; i < targetMatrix.rows; i++) {
      targetMatrix.data[i][0] = target[i] || 0;
    }

    // erro de saída (MSE)
    let err = 0;
    for (let i = 0; i < output.rows; i++) {
      const d = output.data[i][0] - targetMatrix.data[i][0];
      err += d * d;
    }
    err /= output.rows;

    // backward
    let delta = Matrix.subtract(output, targetMatrix);
    const lastLayer = this.layers[this.layers.length - 1];
    delta = Matrix.map(zs[zs.length - 1], (z, i, j) => {
      const a = activations[activations.length - 1].data[i][j];
      return delta.data[i][j] * lastLayer.activation.dfn(a);
    });

    for (let l = this.layers.length - 1; l >= 0; l--) {
      const layer = this.layers[l];
      // delta já considera f'(z) da camada l (menos a de saída, que foi feita acima)
      if (l < this.layers.length - 1) {
        delta = Matrix.map(zs[l], (z, i, j) => {
          const a = activations[l + 1].data[i][j];
          return delta.data[i][j] * layer.activation.dfn(a);
        });
      }

      layer.dw = Matrix.multiply(delta, Matrix.transpose(activations[l]));
      layer.db = delta;

      // delta pra camada anterior
      if (l > 0) {
        delta = Matrix.multiply(Matrix.transpose(layer.w), delta);
      }

      const updated = this.optimizer.update(l, layer.w, layer.b, layer.dw, layer.db);
      layer.w = updated.w;
      layer.b = updated.b;
    }

    return err;
  }

  trainEpoch(dataset, lr = null) {
    if (lr !== null) this.optimizer.lr = lr;
    let totalError = 0;
    for (const sample of dataset) {
      totalError += this.trainSample(sample.input, sample.target);
    }
    const avgError = totalError / dataset.length;
    this.history.push({ epoch: this.history.length + 1, error: avgError });
    return avgError;
  }

  toJSON() {
    return {
      layerSizes: this.layerSizes,
      optimizerName: this.optimizerName,
      lr: this.lr,
      history: this.history,
      layers: this.layers.map((layer) => ({
        w: layer.w.data,
        b: layer.b.data,
      })),
    };
  }

  static fromJSON(json) {
    const model = new Model(json.layerSizes, 'sigmoid', json.optimizerName, json.lr);
    model.history = json.history || [];
    json.layers.forEach((data, i) => {
      model.layers[i].w = new Matrix(data.w.length, data.w[0].length, data.w);
      model.layers[i].b = new Matrix(data.b.length, data.b[0].length, data.b);
    });
    return model;
  }
}

export { Model };
