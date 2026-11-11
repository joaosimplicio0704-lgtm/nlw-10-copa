/* Rede neural multi-camada com backpropagation completo.
   Camadas densas individuais + otimizador Adam integrado.
*/

import { Matrix } from './matrix.js';
import { Activations } from './activations.js';

class Layer {
  constructor(inputSize, outputSize, activation = 'sigmoid') {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.activation = Activations[activation];

    const limit = Math.sqrt(6 / (inputSize + outputSize));
    this.w = Matrix.xavier(outputSize, inputSize).randomize(limit);
    this.b = new Matrix(outputSize, 1).randomize(0.1);

    // cache para backprop
    this.input = null;
    this.z = null;
    this.a = null;

    // estado do otimizador Adam
    this.mW = new Matrix(outputSize, inputSize);
    this.vW = new Matrix(outputSize, inputSize);
    this.mB = new Matrix(outputSize, 1);
    this.vB = new Matrix(outputSize, 1);
  }

  forward(input) {
    this.input = input;
    this.z = Matrix.add(Matrix.multiply(this.w, input), this.b);
    this.a = Matrix.map(this.z, this.activation.fn);
    return this.a;
  }

  backward(deltaOut, t, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, lr = 0.001) {
    // delta da camada atual: deltaOut * f'(a)
    const delta = Matrix.map(this.a, (a, i, j) => {
      return deltaOut.data[i][j] * this.activation.dfn(a);
    });

    // gradientes
    const dw = Matrix.multiply(delta, Matrix.transpose(this.input));
    const db = delta;

    // delta para camada anterior: W^T * delta
    const deltaPrev = Matrix.multiply(Matrix.transpose(this.w), delta);

    // Adam update
    this.mW = Matrix.add(
      Matrix.map(this.mW, (v) => v * beta1),
      Matrix.map(dw, (v) => v * (1 - beta1))
    );
    this.vW = Matrix.add(
      Matrix.map(this.vW, (v) => v * beta2),
      Matrix.map(dw, (v) => v * v * (1 - beta2))
    );
    this.mB = Matrix.add(
      Matrix.map(this.mB, (v) => v * beta1),
      Matrix.map(db, (v) => v * (1 - beta1))
    );
    this.vB = Matrix.add(
      Matrix.map(this.vB, (v) => v * beta2),
      Matrix.map(db, (v) => v * v * (1 - beta2))
    );

    const mWHat = Matrix.map(this.mW, (v) => v / (1 - Math.pow(beta1, t)));
    const vWHat = Matrix.map(this.vW, (v) => v / (1 - Math.pow(beta2, t)));
    const mBHat = Matrix.map(this.mB, (v) => v / (1 - Math.pow(beta1, t)));
    const vBHat = Matrix.map(this.vB, (v) => v / (1 - Math.pow(beta2, t)));

    this.w = Matrix.subtract(
      this.w,
      Matrix.map(mWHat, (v, i, j) => (lr * v) / (Math.sqrt(vWHat.data[i][j]) + eps))
    );
    this.b = Matrix.subtract(
      this.b,
      Matrix.map(mBHat, (v, i, j) => (lr * v) / (Math.sqrt(vBHat.data[i][j]) + eps))
    );

    return deltaPrev;
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      outputSize: this.outputSize,
      w: this.w.data,
      b: this.b.data,
      mW: this.mW.data,
      vW: this.vW.data,
      mB: this.mB.data,
      vB: this.vB.data,
    };
  }

  static fromJSON(json) {
    const layer = new Layer(json.inputSize, json.outputSize, 'sigmoid');
    layer.w = new Matrix(json.w.length, json.w[0].length, json.w);
    layer.b = new Matrix(json.b.length, json.b[0].length, json.b);
    layer.mW = new Matrix(json.mW.length, json.mW[0].length, json.mW);
    layer.vW = new Matrix(json.vW.length, json.vW[0].length, json.vW);
    layer.mB = new Matrix(json.mB.length, json.mB[0].length, json.mB);
    layer.vB = new Matrix(json.vB.length, json.vB[0].length, json.vB);
    return layer;
  }
}

class Network {
  constructor(layerSizes, activation = 'sigmoid') {
    this.layerSizes = layerSizes;
    this.layers = [];
    for (let i = 0; i < layerSizes.length - 1; i++) {
      this.layers.push(new Layer(layerSizes[i], layerSizes[i + 1], activation));
    }
  }

  forward(input) {
    let a = Matrix.fromArray(input);
    const activations = [a];
    const zs = [];
    for (const layer of this.layers) {
      a = layer.forward(a);
      activations.push(a);
    }
    return { activations, zs };
  }

  predict(input) {
    const { activations } = this.forward(input);
    const out = activations[activations.length - 1];
    const arr = Matrix.toArray(out);
    const classIdx = arr.indexOf(Math.max(...arr));
    return { classIdx, probs: arr, output: out };
  }

  train(input, target, lr = 0.001) {
    const { activations } = this.forward(input);
    const output = activations[activations.length - 1];

    const targetMatrix = new Matrix(output.rows, 1);
    for (let i = 0; i < targetMatrix.rows; i++) {
      targetMatrix.data[i][0] = target[i] || 0;
    }

    // erro MSE
    let err = 0;
    for (let i = 0; i < output.rows; i++) {
      const d = output.data[i][0] - targetMatrix.data[i][0];
      err += d * d;
    }
    err /= output.rows;

    // backprop
    let delta = Matrix.subtract(output, targetMatrix);
    delta = Matrix.map(output, (v, i, j) => {
      return delta.data[i][j] * this.layers[this.layers.length - 1].activation.dfn(v);
    });

    // t global do Adam (incrementa a cada treino)
    if (!this._adamT) this._adamT = 0;
    this._adamT++;

    for (let l = this.layers.length - 1; l >= 0; l--) {
      const layer = this.layers[l];
      if (l < this.layers.length - 1) {
        delta = Matrix.map(activations[l + 1], (a, i, j) => {
          return delta.data[i][j] * layer.activation.dfn(a);
        });
      }
      const deltaPrev = layer.backward(delta, this._adamT, 0.9, 0.999, 1e-8, lr);
      delta = deltaPrev;
    }

    return err;
  }

  toJSON() {
    return {
      layerSizes: this.layerSizes,
      layers: this.layers.map((l) => l.toJSON()),
      adamT: this._adamT || 0,
    };
  }

  static fromJSON(json) {
    const net = new Network(json.layerSizes, 'sigmoid');
    net._adamT = json.adamT || 0;
    net.layers = json.layers.map((lj) => Layer.fromJSON(lj));
    return net;
  }
}

export { Network, Layer };
