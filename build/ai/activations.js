/* Funções de ativação e derivadas. */

const Activations = {
  sigmoid: {
    fn: (x) => 1 / (1 + Math.exp(-x)),
    dfn: (y) => y * (1 - y),
  },
  relu: {
    fn: (x) => Math.max(0, x),
    dfn: (y) => (y > 0 ? 1 : 0),
  },
  leakyRelu: {
    fn: (x) => (x > 0 ? x : 0.01 * x),
    dfn: (y) => (y > 0 ? 1 : 0.01),
  },
  tanh: {
    fn: (x) => Math.tanh(x),
    dfn: (y) => 1 - y * y,
  },
};

export { Activations };
