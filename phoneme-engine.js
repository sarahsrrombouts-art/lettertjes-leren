/* Lettertjes leren — phoneme engine (experimental "klankmodus")
   Runs facebook/wav2vec2-xlsr-53-espeak-cv-ft in the browser via
   onnxruntime-web. The model hears PHONEMES, not words — a held "mmm"
   comes out as the IPA token "m" directly.

   The quantized model (~330MB) is too big for one GitHub file, so the
   convert-model GitHub Action splits it into model/model.onnx.partNN
   chunks plus a model/manifest.json. We fetch the chunks (same origin
   on GitHub Pages), stitch them together, and keep the session warm.

   Audio path: getUserMedia → AudioContext → ScriptProcessor taps PCM →
   RMS voice-activity detection segments utterances (max ~2s) →
   resample to 16kHz mono → zero-mean/unit-variance normalize →
   session.run → CTC greedy decode → IPA tokens → Dutch letters. */
(function () {
  "use strict";

  var SAMPLE_RATE = 16000;
  var MAX_SEGMENT_S = 2.0;   // cap per-utterance audio fed to the model
  var VAD_THRESH = 0.045;    // same RMS gate as the meter in engine.js
  var VAD_HANG_MS = 350;     // keep recording this long after sound stops
  var PRE_ROLL_S = 0.2;      // audio kept from just before the sound began

  /* ---------- IPA (espeak) tokens → Dutch letters ----------
     The model emits espeak IPA labels. Map every label we expect to
     the letter a Dutch child is learning. Unknown tokens are skipped. */
  var IPA_MAP = {
    "a": "a", "aː": "a", "ɑ": "a", "ɑː": "a", "æ": "a",
    "b": "b",
    "d": "d",
    "e": "e", "eː": "e", "ɛ": "e", "ə": "e", "ɜ": "e", "ɜː": "e",
    "f": "f",
    "ɡ": "g", "g": "g", "ɣ": "g", "x": "g", "χ": "g",
    "h": "h", "ɦ": "h",
    "i": "i", "iː": "i", "ɪ": "i",
    "j": "j", "dʒ": "j",
    "k": "k", "c": "k",
    "l": "l", "ɫ": "l",
    "m": "m",
    "n": "n", "ŋ": "n", "ɲ": "n",
    "o": "o", "oː": "o", "ɔ": "o", "ɔː": "o", "ʊ": "o", "u": "o", "uː": "o",
    "p": "p",
    "q": "q",
    "r": "r", "ʀ": "r", "ɾ": "r", "ɹ": "r",
    "s": "s", "ʃ": "s",
    "t": "t",
    "y": "u", "yː": "u", "ʏ": "u", "ø": "u", "øː": "u", "œ": "u", "ʉ": "u",
    "v": "v",
    "w": "w", "ʋ": "w",
    "z": "z", "ʒ": "z",
    "ts": "t", "tʃ": "t"
  };

  /* ---------- CTC greedy decode ----------
     logits: Float32Array [frames * vocab]; argmax per frame, collapse
     repeats, drop blanks. Returns array of token ids. */
  function ctcDecode(logits, frames, vocab, blankId) {
    var ids = [];
    var prev = -1;
    for (var f = 0; f < frames; f++) {
      var off = f * vocab;
      var best = 0, bestV = logits[off];
      for (var v = 1; v < vocab; v++) {
        if (logits[off + v] > bestV) { bestV = logits[off + v]; best = v; }
      }
      if (best !== blankId && best !== prev) ids.push(best);
      prev = best;
    }
    return ids;
  }

  function lettersFromIds(ids, id2token) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var tok = id2token[ids[i]];
      if (!tok) continue;
      var c = IPA_MAP[tok];
      if (c) out.push(c);
    }
    return out;
  }

  /* ---------- linear resampler (any rate → 16k mono) ---------- */
  function resampleTo16k(input, fromRate) {
    if (fromRate === SAMPLE_RATE) return input;
    var ratio = fromRate / SAMPLE_RATE;
    var outLen = Math.floor(input.length / ratio);
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var pos = i * ratio;
      var i0 = Math.floor(pos);
      var i1 = Math.min(i0 + 1, input.length - 1);
      var frac = pos - i0;
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return out;
  }

  function normalize(x) {
    var n = x.length, i, mean = 0;
    for (i = 0; i < n; i++) mean += x[i];
    mean /= n;
    var varsum = 0;
    for (i = 0; i < n; i++) { var d = x[i] - mean; varsum += d * d; }
    var std = Math.sqrt(varsum / n) || 1;
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = (x[i] - mean) / (std + 1e-7);
    return out;
  }

  /* ---------- model loading (chunked) ---------- */
  function loadModel(baseUrl, onProgress) {
    return fetch(baseUrl + "manifest.json")
      .then(function (r) {
        if (!r.ok) throw new Error("model-missing");
        return r.json();
      })
      .then(function (man) {
        var total = man.totalBytes || 0;
        var got = 0;
        var bufs = [];
        var chain = Promise.resolve();
        man.parts.forEach(function (part) {
          chain = chain.then(function () {
            return fetch(baseUrl + part).then(function (r) {
              if (!r.ok) throw new Error("model-missing");
              return r.arrayBuffer();
            }).then(function (ab) {
              bufs.push(ab);
              got += ab.byteLength;
              if (onProgress && total) onProgress(got / total);
            });
          });
        });
        return chain.then(function () {
          var full = new Uint8Array(got);
          var off = 0;
          bufs.forEach(function (ab) { full.set(new Uint8Array(ab), off); off += ab.byteLength; });
          return { weights: full, vocab: man.vocab, blankId: man.blankId };
        });
      });
  }

  /* ---------- the engine ---------- */
  function PhonemeEngine(opts) {
    this.onLetters = opts.onLetters;          // (letters[]) per utterance
    this.onSpeaking = opts.onSpeaking;        // (bool)
    this.onLevel = opts.onLevel || function () {};
    this.onStatus = opts.onStatus || function () {}; // 'loading'|progress|'ready'|'thinking'|'model-missing'|'error'
    this.baseUrl = opts.baseUrl || "model/";
    this.session = null;
    this.id2token = null;
    this.blankId = 0;
    this.busy = false;
    this.running = false;
  }

  PhonemeEngine.prototype.start = function (stream) {
    var self = this;
    self.running = true;
    self.onStatus({ state: "loading", progress: 0 });
    var load = loadModel(self.baseUrl, function (p) {
      self.onStatus({ state: "loading", progress: p });
    }).then(function (m) {
      var ort = window.ort;
      ort.env.wasm.wasmPaths = "vendor/ort/";
      ort.env.wasm.numThreads = 1; // GH Pages lacks cross-origin isolation
      self.id2token = m.vocab;
      self.blankId = m.blankId;
      return ort.InferenceSession.create(m.weights, { executionProviders: ["wasm"] });
    }).then(function (session) {
      self.session = session;
      self.onStatus({ state: "ready" });
    });
    self._setupAudio(stream);
    return load.catch(function (err) {
      self.onStatus({ state: String(err && err.message) === "model-missing" ? "model-missing" : "error" });
      throw err;
    });
  };

  PhonemeEngine.prototype._setupAudio = function (stream) {
    var self = this;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ac = new Ctx();
    this.audioCtx = ac;
    var src = ac.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally supported and fine
    // for a 4096-sample tap; an AudioWorklet would need another file.
    var proc = ac.createScriptProcessor(4096, 1, 1);
    var rate = ac.sampleRate;
    var preRollLen = Math.round(PRE_ROLL_S * rate);
    var maxLen = Math.round(MAX_SEGMENT_S * rate);
    var preRoll = [];
    var preRollSamples = 0;
    var segment = [];
    var segmentSamples = 0;
    var voiced = false;
    var lastVoiceT = 0;

    proc.onaudioprocess = function (e) {
      var chunk = e.inputBuffer.getChannelData(0);
      var rms = 0;
      for (var i = 0; i < chunk.length; i++) rms += chunk[i] * chunk[i];
      rms = Math.sqrt(rms / chunk.length);
      self.onLevel(Math.min(1, rms / 0.35));

      var now = Date.now();
      var loud = rms > VAD_THRESH;
      if (loud) lastVoiceT = now;

      if (!voiced) {
        // keep a short pre-roll so the attack of the sound isn't lost
        preRoll.push(new Float32Array(chunk));
        preRollSamples += chunk.length;
        while (preRollSamples > preRollLen && preRoll.length > 1) {
          preRollSamples -= preRoll.shift().length;
        }
        if (loud) {
          voiced = true;
          self.onSpeaking(true);
          segment = preRoll.slice();
          segmentSamples = preRollSamples;
          preRoll = []; preRollSamples = 0;
        }
      } else {
        segment.push(new Float32Array(chunk));
        segmentSamples += chunk.length;
        var ended = !loud && (now - lastVoiceT) > VAD_HANG_MS;
        if (ended || segmentSamples >= maxLen) {
          var seg = segment; var segN = segmentSamples;
          segment = []; segmentSamples = 0;
          if (ended) { voiced = false; self.onSpeaking(false); }
          self._infer(seg, segN, rate);
        }
      }
    };
    src.connect(proc);
    proc.connect(ac.destination); // required by some browsers to run the node
    this.processor = proc;
  };

  PhonemeEngine.prototype._infer = function (chunks, totalSamples, rate) {
    var self = this;
    if (!self.session || self.busy || !self.running) return;
    var joined = new Float32Array(totalSamples);
    var off = 0;
    chunks.forEach(function (c) { joined.set(c, off); off += c.length; });
    var audio = normalize(resampleTo16k(joined, rate));
    if (audio.length < SAMPLE_RATE * 0.15) return; // too short to mean anything

    self.busy = true;
    self.onStatus({ state: "thinking" });
    var ort = window.ort;
    var tensor = new ort.Tensor("float32", audio, [1, audio.length]);
    var run = self._runOverride // test seam: Playwright stubs inference here
      ? self._runOverride(audio)
      : self.session.run({ input_values: tensor }).then(function (res) {
          var logits = res.logits;
          return { data: logits.data, frames: logits.dims[1], vocab: logits.dims[2] };
        });
    run.then(function (out) {
      var ids = ctcDecode(out.data, out.frames, out.vocab, self.blankId);
      var letters = lettersFromIds(ids, self.id2token);
      self.busy = false;
      self.onStatus({ state: "ready" });
      if (letters.length) self.onLetters(letters, audio.length / SAMPLE_RATE);
    }).catch(function () {
      self.busy = false;
      self.onStatus({ state: "ready" });
    });
  };

  PhonemeEngine.prototype.stop = function () {
    this.running = false;
    if (this.processor) try { this.processor.disconnect(); } catch (e) {}
    if (this.audioCtx) try { this.audioCtx.close(); } catch (e) {}
  };

  // exposed for unit tests
  PhonemeEngine._ctcDecode = ctcDecode;
  PhonemeEngine._lettersFromIds = lettersFromIds;
  PhonemeEngine._IPA_MAP = IPA_MAP;

  window.PhonemeEngine = PhonemeEngine;
})();
