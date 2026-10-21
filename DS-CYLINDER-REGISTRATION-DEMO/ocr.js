/* Local baseline only. Reuses the IQC worker lifecycle; no portal or cloud requests. */
(function() {
  'use strict';
  const { Engine, fault, workerFault } = window.IqcOcrEngine31;
  const WORKER = new URL('../DS-IQC-IMAGE/iqc-ocr-worker-rc31.js', document.currentScript.src).href;
  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let engine;
  function create(logger) {
    let native, wrapper, dead = false, script, rejectLoad;
    const terminate = () => {
      dead = true;
      if (script) { script.onload = script.onerror = null; script.remove(); script = null; rejectLoad?.(fault('CANCELLED')); }
      try { native?.terminate(); } catch (_) {}
      try { Promise.resolve(wrapper?.terminate()).catch(() => {}); } catch (_) {}
    };
    const library = window.Tesseract ? Promise.resolve() : new Promise((resolve, reject) => {
      rejectLoad = reject; script = document.createElement('script'); script.src = LIB; script.crossOrigin = 'anonymous';
      script.onload = () => { script.remove(); script = null; resolve(); };
      script.onerror = () => reject(fault('LIB_LOAD')); document.head.appendChild(script);
    });
    const ready = library.then(() => {
      if (dead) throw fault('CANCELLED');
      return new Promise((resolve, reject) => {
        const broken = error => { const e = workerFault(error); reject(e); terminate(); engine.dispose(e); };
        const NativeWorker = window.Worker;
        window.Worker = new Proxy(NativeWorker, { construct(target, args) {
          const w = Reflect.construct(target, args);
          if (String(args[0]) === WORKER) {
            native = w;
            w.addEventListener('message', event => {
              if (event.data?.rc31WorkerFailure) { event.stopImmediatePropagation(); broken(event.data.error); }
              else if (event.data?.status === 'reject') broken(event.data.data);
            });
            w.addEventListener('error', () => broken(fault('WORKER_CRASH')));
          }
          return w;
        }});
        let pending;
        try {
          pending = window.Tesseract.createWorker('eng', 1, {
            workerPath: WORKER, workerBlobURL: false,
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js',
            langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
            cachePath: 'cylinder-registration-demo-eng-v1', logger, errorHandler: broken
          });
        } catch (e) { broken(e); } finally { window.Worker = NativeWorker; }
        if (!native) { Promise.resolve(pending).then(w => w?.terminate()).catch(() => {}); reject(fault('WORKER_CAPTURE')); return; }
        Promise.resolve(pending).then(w => { wrapper = w; if (dead) { terminate(); reject(fault('CANCELLED')); } else resolve(w); }, broken);
      });
    });
    return { ready, terminate };
  }
  engine = new Engine({ create, onEvent: e => window.dispatchEvent(new CustomEvent('registration-ocr-progress', { detail: e })) });
  window.RegistrationOcr = {
    recognize: async canvas => (await engine.recognize(canvas, '7'))?.data?.text || '',
    stop: () => engine.dispose('CANCELLED'), release: () => engine.release()
  };
})();
