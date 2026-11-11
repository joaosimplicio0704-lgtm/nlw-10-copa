/* Multi-layer perceptron with backpropagation. */
import { Matrix } from './matrix.js';
import { Activations } from './activations.js';

class Network {
  constructor(layerSizes, activation = 'sigmoid') {
    this.layerSizes = layerSizes;
    this.activation = Activations[activation];
    this.weights = [];
    this.biases = [];

    for (let i = 0; i < layerSizes.length - 1; i++) {
      const w = Matrix.xavier(layerSizes[i + 1], layerSizes[i]);
      const b = new Matrix(layerSizes[i + 1], 1);
      b.randomize(0.1);
      this.weights.push(w);
      this.biases.push(b);
    }
  }

  forward(input) {
    let activations = [Matrix.fromArray(input)];
    let zs = [];

    for (let i = 0; i < this.weights.length; i++) {
      const z = Matrix.add(
        Matrix.multiply(this.weights[i], activations[i]),
        this.biases[i]
      );
      zs.push(z);
      const a = Matrix.map(z, this.activation.fn);
      activations.push(a);
    }

    return { activations, zs };
  }

  predict(input) {
    const { activations } = this.forward(input);
    const out = activations[activations.length - 1];
    const arr = Matrix.toArray(out);
    return arr.indexOf(Math.max(...arr));
  }

  train(input, target, lr) {
    const { activations, zs } = this.forward(input);
    const output = activations[activations.length - 1];

    const targetMatrix = new Matrix(output.rows, 1);
    for (let i = 0; i < targetMatrix.rows; i++) {
      targetMatrix.data[i][0] = target[i] || 0;
    }

    // delta da camada de saída: (saída - alvo) * dfn(z)
    let delta = Matrix.subtract(output, targetMatrix);
    delta = Matrix.map(zs[zs.length - 1], (z, i, j) => {
      const a = this.activation.fn(z);
      return delta.data[i][j] * this.activation.dfn(a);
    });

    const L = this.weights.length;
    const nablaW = new Array(L);
    const nablaB = new Array(L);

    nablaB[L - 1] = delta;
    nablaW[L - 1] = Matrix.multiply(
      delta,
      Matrix.transpose(activations[L - 1])
    );

    // backpropaga pelas camadas escondidas. dfn recebe o valor ativado a = f(z),
    // não o pré-ativação z.
    for (let l = 2; l <= L; l++) {
      const a = activations[activations.length - l];
      const sp = Matrix.map(a, this.activation.dfn);
      delta = Matrix.multiply(
        Matrix.transpose(this.weights[L - l + 1]),
        delta
      );
      delta = Matrix.map(delta, (v, i, j) => v * sp.data[i][j]);
      nablaB[L - l] = delta;
      nablaW[L - l] = Matrix.multiply(
        delta,
        Matrix.transpose(activations[activations.length - l - 1])
      );
    }

    // descida do gradiente
    for (let i = 0; i < L; i++) {
      this.weights[i] = Matrix.subtract(
        this.weights[i],
        Matrix.map(nablaW[i], (v) => v * lr)
      );
      this.biases[i] = Matrix.subtract(
        this.biases[i],
        Matrix.map(nablaB[i], (v) => v * lr)
      );
    }

    // erro quadrático médio
    let err = 0;
    for (let i = 0; i < output.rows; i++) {
      const d = output.data[i][0] - targetMatrix.data[i][0];
      err += d * d;
    }
    return err / output.rows;
  }

  toJSON() {
    return {
      layerSizes: this.layerSizes,
      weights: this.weights.map((w) => w.data),
      biases: this.biases.map((b) => b.data),
    };
  }

  static fromJSON(json) {
    const net = new Network(json.layerSizes, 'sigmoid');
    net.weights = json.weights.map((d) => new Matrix(d.length, d[0].length, d));
    net.biases = json.biases.map((d) => new Matrix(d.length, d[0].length, d));
    return net;
  }
}

export { Network };
