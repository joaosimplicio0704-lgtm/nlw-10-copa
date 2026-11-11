/* Camada densa com forward e backward próprios.
   Guarda o cache da ativação e do pré-ativação para usar no backprop.
*/

class Dense {
  constructor(inputSize, outputSize, activation = 'sigmoid') {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.activation = Activations[activation];
    this.activationName = activation;

    // Xavier/Glorot
    const limit = Math.sqrt(6 / (inputSize + outputSize));
    this.w = Matrix.xavier(outputSize, inputSize).randomize(limit);
    this.b = new Matrix(outputSize, 1).randomize(0.1);

    // cache para backward
    this.input = null;
    this.z = null;
    this.a = null;

    // gradientes acumulados
    this.dw = new Matrix(outputSize, inputSize);
    this.db = new Matrix(outputSize, 1);
  }

  forward(input) {
    this.input = input;
    this.z = Matrix.add(Matrix.multiply(this.w, input), this.b);
    this.a = Matrix.map(this.z, this.activation.fn);
    return this.a;
  }

  backward(deltaOut, lr, optimizer, layerIndex) {
    // delta da camada atual = deltaOut * f'(z)
    const delta = Matrix.map(this.z, (z, i, j) => {
      const a = this.a.data[i][j];
      return deltaOut.data[i][j] * this.activation.dfn(a);
    });

    // gradientes
    this.dw = Matrix.multiply(delta, Matrix.transpose(this.input));
    this.db = delta;

    // propaga delta pra camada anterior: W^T * delta
    const deltaPrev = Matrix.multiply(Matrix.transpose(this.w), delta);

    // atualiza pesos via otimizador
    const updated = optimizer.update(layerIndex, this.w, this.b, this.dw, this.db);
    this.w = updated.w;
    this.b = updated.b;

    return deltaPrev;
  }
}

import { Matrix } from './matrix.js';
import { Activations } from './activations.js';

export { Dense };
