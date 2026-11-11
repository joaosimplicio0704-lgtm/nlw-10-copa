/* Matrix math from scratch. Zero dependencies. */

class Matrix {
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      this.data = data;
    } else {
      this.data = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => 0)
      );
    }
  }

  static fromArray(arr) {
    return new Matrix(arr.length, 1, arr.map((v) => [v]));
  }

  static toArray(m) {
    return m.data.map((row) => row[0]);
  }

  static subtract(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error('matrizes com dimensões diferentes');
    }
    const res = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        res.data[i][j] = a.data[i][j] - b.data[i][j];
      }
    }
    return res;
  }

  static multiply(a, b) {
    if (a.cols !== b.rows) {
      throw new Error(`dimensões incompatíveis: ${a.cols} != ${b.rows}`);
    }
    const res = new Matrix(a.rows, b.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < b.cols; j++) {
        let sum = 0;
        for (let k = 0; k < a.cols; k++) {
          sum += a.data[i][k] * b.data[k][j];
        }
        res.data[i][j] = sum;
      }
    }
    return res;
  }

  static transpose(a) {
    const res = new Matrix(a.cols, a.rows);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        res.data[j][i] = a.data[i][j];
      }
    }
    return res;
  }

  static map(m, fn) {
    const res = new Matrix(m.rows, m.cols);
    for (let i = 0; i < m.rows; i++) {
      for (let j = 0; j < m.cols; j++) {
        res.data[i][j] = fn(m.data[i][j], i, j);
      }
    }
    return res;
  }

  static add(a, b) {
    const res = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        res.data[i][j] = a.data[i][j] + b.data[i][j];
      }
    }
    return res;
  }

  randomize(scale = 1) {
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        this.data[i][j] = (Math.random() * 2 - 1) * scale;
      }
    }
    return this;
  }

  // inicialização Xavier/Glorot: mantém a variância das ativações estável pelas camadas
  static xavier(rows, cols) {
    const limit = Math.sqrt(6 / (rows + cols));
    const m = new Matrix(rows, cols);
    return m.randomize(limit);
  }
}

export { Matrix };
