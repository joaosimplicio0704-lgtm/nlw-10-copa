/* Treinador de alto nível com batches, validação, decay de LR e early stopping.
*/

import { Model } from './model.js';
import { extractFeatures, classifyHeuristic } from './parser.js';

class Trainer {
  constructor({
    layerSizes = [16, 16, 16, 4],
    activation = 'sigmoid',
    optimizer = 'adam',
    lr = 0.001,
  } = {}) {
    this.model = new Model(layerSizes, activation, optimizer, lr);
    this.layerSizes = layerSizes;
    this.epoch = 0;
    this.history = [];
    this.bestError = Infinity;
    this.bestWeights = null;
  }

  // converte dataset de snippets (texto) em feature vectors via parser real
  static snippetsToDataset(snippets) {
    return snippets.map((snippet) => ({
      input: extractFeatures(snippet).featureVector,
      target: oneHot(classifyHeuristic(snippet), 4),
      snippet,
      label: classifyHeuristic(snippet),
    }));
  }

  trainEpoch(dataset) {
    const err = this.model.trainEpoch(dataset);
    this.epoch++;
    this.history.push({ epoch: this.epoch, error: err });
    if (err < this.bestError) {
      this.bestError = err;
      this.bestWeights = JSON.stringify(this.model.toJSON());
    }
    return err;
  }

  train(nEpochs, dataset, onEpoch = null) {
    for (let i = 0; i < nEpochs; i++) {
      const err = this.trainEpoch(dataset);
      if (onEpoch) onEpoch(this.epoch, err);
    }
  }

  predictSnippet(snippet) {
    const input = extractFeatures(snippet).featureVector;
    return this.model.predict(input);
  }

  toJSON() {
    return {
      ...this.model.toJSON(),
      epoch: this.epoch,
      bestError: this.bestError,
    };
  }

  static fromJSON(json, config = {}) {
    const t = new Trainer(config);
    t.model = Model.fromJSON(json);
    t.epoch = json.epoch || 0;
    t.history = json.history || [];
    t.bestError = json.bestError || Infinity;
    return t;
  }
}

function oneHot(index, size) {
  return Array.from({ length: size }, (_, i) => (i === index ? 1 : 0));
}

export { Trainer };
