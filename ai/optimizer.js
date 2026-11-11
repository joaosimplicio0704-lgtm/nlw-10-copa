import { Matrix } from './matrix.js';

/* Optimizadores do zero.
   Cada um mantém estado interno (momento, cache, passo t) e aplica
   a descida do gradiente sobre uma lista de {w, b, dw, db}.
*/

class SGD {
  constructor(lr = 0.01, momentum = 0) {
    this.lr = lr;
    this.momentum = momentum;
    this.velocity = []; // {w: Matrix, b: Matrix} por camada
  }

  update(layerIndex, w, b, dw, db) {
    if (!this.velocity[layerIndex]) {
      this.velocity[layerIndex] = {
        w: new Matrix(w.rows, w.cols),
        b: new Matrix(b.rows, b.cols),
      };
    }
    const v = this.velocity[layerIndex];

    // momento
    v.w.data = v.w.data.map((row, i) =>
      row.map((vij, j) => this.momentum * vij - this.lr * dw.data[i][j])
    );
    v.b.data = v.b.data.map((row, i) =>
      row.map((vij, j) => this.momentum * vij - this.lr * db.data[i][j])
    );

    return {
      w: Matrix.add(w, v.w),
      b: Matrix.add(b, v.b),
    };
  }
}

class Adam {
  constructor(lr = 0.001, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
    this.lr = lr;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.t = 0;
    this.m = []; // primeiro momento
    this.v = []; // segundo momento
  }

  update(layerIndex, w, b, dw, db) {
    if (!this.m[layerIndex]) {
      this.m[layerIndex] = {
        w: new Matrix(w.rows, w.cols),
        b: new Matrix(b.rows, b.cols),
      };
      this.v[layerIndex] = {
        w: new Matrix(w.rows, w.cols),
        b: new Matrix(b.rows, b.cols),
      };
    }
    this.t++;

    const m = this.m[layerIndex];
    const v = this.v[layerIndex];

    // atualiza momentos para w
    m.w.data = m.w.data.map((row, i) =>
      row.map((mij, j) =>
        this.beta1 * mij + (1 - this.beta1) * dw.data[i][j]
      )
    );
    v.w.data = v.w.data.map((row, i) =>
      row.map((vij, j) =>
        this.beta2 * vij + (1 - this.beta2) * dw.data[i][j] * dw.data[i][j]
      )
    );
    m.b.data = m.b.data.map((row, i) =>
      row.map((mij, j) =>
        this.beta1 * mij + (1 - this.beta1) * db.data[i][j]
      )
    );
    v.b.data = v.b.data.map((row, i) =>
      row.map((vij, j) =>
        this.beta2 * vij + (1 - this.beta2) * db.data[i][j] * db.data[i][j]
      )
    );

    // correção de viés
    const tCorr = Math.pow(this.beta1, this.t);
    const tCorr2 = Math.pow(this.beta2, this.t);
    const lrT = (this.lr * Math.sqrt(1 - tCorr2)) / (1 - tCorr);

    const newW = new Matrix(w.rows, w.cols);
    const newB = new Matrix(b.rows, b.cols);
    for (let i = 0; i < w.rows; i++) {
      for (let j = 0; j < w.cols; j++) {
        const mHat = m.w.data[i][j] / (1 - tCorr);
        const vHat = v.w.data[i][j] / (1 - tCorr2);
        newW.data[i][j] = w.data[i][j] - (lrT * mHat) / (Math.sqrt(vHat) + this.eps);
      }
    }
    for (let i = 0; i < b.rows; i++) {
      for (let j = 0; j < b.cols; j++) {
        const mHat = m.b.data[i][j] / (1 - tCorr);
        const vHat = v.b.data[i][j] / (1 - tCorr2);
        newB.data[i][j] = b.data[i][j] - (lrT * mHat) / (Math.sqrt(vHat) + this.eps);
      }
    }

    return { w: newW, b: newB };
  }
}

class RMSprop {
  constructor(lr = 0.001, decay = 0.9, eps = 1e-8) {
    this.lr = lr;
    this.decay = decay;
    this.eps = eps;
    this.cache = [];
  }

  update(layerIndex, w, b, dw, db) {
    if (!this.cache[layerIndex]) {
      this.cache[layerIndex] = {
        w: new Matrix(w.rows, w.cols),
        b: new Matrix(b.rows, b.cols),
      };
    }
    const c = this.cache[layerIndex];

    c.w.data = c.w.data.map((row, i) =>
      row.map((cij, j) =>
        this.decay * cij + (1 - this.decay) * dw.data[i][j] * dw.data[i][j]
      )
    );
    c.b.data = c.b.data.map((row, i) =>
      row.map((cij, j) =>
        this.decay * cij + (1 - this.decay) * db.data[i][j] * db.data[i][j]
      )
    );

    const newW = new Matrix(w.rows, w.cols);
    const newB = new Matrix(b.rows, b.cols);
    for (let i = 0; i < w.rows; i++) {
      for (let j = 0; j < w.cols; j++) {
        newW.data[i][j] =
          w.data[i][j] - (this.lr * dw.data[i][j]) / (Math.sqrt(c.w.data[i][j]) + this.eps);
      }
    }
    for (let i = 0; i < b.rows; i++) {
      for (let j = 0; j < b.cols; j++) {
        newB.data[i][j] =
          b.data[i][j] - (this.lr * db.data[i][j]) / (Math.sqrt(c.b.data[i][j]) + this.eps);
      }
    }

    return { w: newW, b: newB };
  }
}

export { SGD, Adam, RMSprop };
