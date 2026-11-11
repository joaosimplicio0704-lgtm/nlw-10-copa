/* Activation functions and their derivatives. */

const Activations = {
  sigmoid: {
    fn: (x) => 1 / (1 + Math.exp(-x)),
    dfn: (y) => y * (1 - y),
  },
  relu: {
    fn: (x) => Math.max(0, x),
    dfn: (y) => (y > 0 ? 1 : 0),
  },
  tanh: {
    fn: (x) => Math.tanh(x),
    dfn: (y) => 1 - y * y,
  },
  softmax: {
    fn: (x) => {
      const m = Math.max(...x);
      const exps = x.map((v) => Math.exp(v - m));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map((v) => v / sum);
    },
    // softmax derivative is a Jacobian; handled separately in cross-entropy
    dfn: null,
  },
};

export { Activations };
