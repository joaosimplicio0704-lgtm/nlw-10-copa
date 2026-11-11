/* Treinador da IA com persistência em localStorage.
   Os pesos são gravados no navegador e não somem ao recarregar a página.
*/

import { Network } from './network.js';
import { extractFeatures, classifyHeuristic } from './parser.js';

const STORAGE_KEY = 'ia_memoria_v2';

class Trainer {
  constructor({ layerSizes = [16, 16, 16, 4], lr = 0.001 } = {}) {
    this.network = new Network(layerSizes, 'sigmoid');
    this.lr = lr;
    this.epoch = 0;
    this.history = [];
    this.totalTrained = 0;
    this.load();
  }

  trainSample(input, target) {
    const err = this.network.train(input, target, this.lr);
    this.totalTrained++;
    return err;
  }

  trainEpoch(dataset) {
    let totalError = 0;
    for (const sample of dataset) {
      totalError += this.trainSample(sample.input, sample.target);
    }
    this.epoch++;
    const avgError = totalError / dataset.length;
    this.history.push({ epoch: this.epoch, error: avgError });
    if (this.history.length > 200) this.history.shift();
    this.save();
    return avgError;
  }

  predictSnippet(snippet) {
    const input = extractFeatures(snippet).featureVector;
    return this.network.predict(input);
  }

  _storage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }

  save() {
    const store = this._storage();
    if (!store) return;
    try {
      const payload = {
        network: this.network.toJSON(),
        epoch: this.epoch,
        lr: this.lr,
        history: this.history,
        totalTrained: this.totalTrained,
        version: 2,
        savedAt: new Date().toISOString(),
      };
      store.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('não foi possível salvar memória:', e);
    }
  }

  load() {
    const store = this._storage();
    if (!store) return;
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.network) {
        this.network = Network.fromJSON(payload.network);
        this.epoch = payload.epoch || 0;
        this.lr = payload.lr || 0.001;
        this.history = payload.history || [];
        this.totalTrained = payload.totalTrained || 0;
      }
    } catch (e) {
      console.warn('não foi possível carregar memória:', e);
    }
  }

  reset() {
    this.network = new Network([16, 16, 16, 4], 'sigmoid');
    this.epoch = 0;
    this.history = [];
    this.totalTrained = 0;
    localStorage.removeItem(STORAGE_KEY);
  }

  exportJSON() {
    return JSON.stringify({
      network: this.network.toJSON(),
      epoch: this.epoch,
      lr: this.lr,
      history: this.history,
      totalTrained: this.totalTrained,
      version: 2,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  importJSON(json) {
    try {
      const payload = JSON.parse(json);
      this.network = Network.fromJSON(payload.network);
      this.epoch = payload.epoch || 0;
      this.lr = payload.lr || 0.001;
      this.history = payload.history || [];
      this.totalTrained = payload.totalTrained || 0;
      this.save();
      return true;
    } catch (e) {
      return false;
    }
  }
}

export { Trainer, STORAGE_KEY };
