/* Lettertjes leren — letter engine
   Listens to the microphone (Web Audio level meter + Web Speech
   recognition in Dutch) and emits ONE letter per distinct sound,
   repeated while the sound is held (AAAA…).
   Drives an imperative "tape" of giant letters that slides left.
   Vibrates the device as each letter lands.
   Falls back to the keyboard so the screen is usable without a mic. */
(function () {
  "use strict";

  var FRIENDLY = [
    "#D97757", // claude orange
    "#3B7BBF", // blue
    "#4F9D69", // green
    "#8A6BC4", // purple
    "#2FA39B", // teal
    "#D9709A", // pink
    "#E0A33E", // amber
    "#D9645C", // warm red
    "#5C8A3A", // olive
    "#C2693F"  // terracotta
  ];

  function stripDiacritics(s) {
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }

  // Dutch letter names as the recognizer tends to spell them.
  // "bee" must become b, not e — the recognizer returns words, so map
  // whole words before falling back to single characters. Includes
  // common misrecognitions: Dutch "cee" sounds like "zee" to Google.
  var NAME_MAP = {
    aa: "a", ah: "a", bee: "b", be: "b", bij: "b", cee: "c", see: "c",
    zee: "c", dee: "d", de: "d", ee: "e", eh: "e", he: "e", ef: "f",
    gee: "g", ge: "g", ha: "h", haa: "h", ie: "i", jee: "j", je: "j",
    ka: "k", kaa: "k", el: "l", em: "m", en: "n", oo: "o", oh: "o",
    pee: "p", pe: "p", ku: "q", kuu: "q", er: "r", es: "s", tee: "t",
    thee: "t", te: "t", uu: "u", vee: "v", ve: "v", wee: "w", we: "w",
    iks: "x", ex: "x", ypsilon: "y", zet: "z", zed: "z",
    hm: "m", hmm: "m"
  };
  function wordsOf(transcript) {
    var t = stripDiacritics(String(transcript || "").toLowerCase());
    return t.match(/[a-z]+/g) || [];
  }
  // strict resolution: only words that clearly mean one letter
  function resolveWord(w) {
    if (NAME_MAP[w]) return NAME_MAP[w];
    if (w.length === 1) return w;
    var same = true;
    for (var i = 1; i < w.length; i++) {
      if (w[i] !== w[0]) { same = false; break; }
    }
    if (same) return w[0]; // "aaa" → a
    return null;
  }
  function letterStrict(transcript) {
    var ws = wordsOf(transcript);
    for (var i = ws.length - 1; i >= 0; i--) {
      var c = resolveWord(ws[i]);
      if (c) return c;
    }
    return null;
  }
  function letterFrom(transcript) {
    var c = letterStrict(transcript);
    if (c) return c;
    var ws = wordsOf(transcript);
    if (!ws.length) return null;
    var w = ws[ws.length - 1];
    return w[w.length - 1];
  }
  // how many times the letter was actually heard in the transcript —
  // "dee dee" → 2, a held "mmmm" → one word, counted by its length
  function countFor(transcript, c) {
    var n = 0;
    var ws = wordsOf(transcript);
    for (var i = 0; i < ws.length; i++) {
      if (resolveWord(ws[i]) === c) {
        n += (!NAME_MAP[ws[i]] && ws[i].length > 1 && ws[i][0] === c)
          ? Math.min(8, ws[i].length) : 1;
      }
    }
    return n || 1;
  }

  /* ---------- The tape of giant letters ---------- */
  function Tape(centerEl, trackEl, getConfig) {
    this.center = centerEl;
    this.track = trackEl;
    this.getConfig = getConfig;
  }
  Tape.prototype.colorFor = function (lower) {
    var cfg = this.getConfig();
    if (cfg.colorMode === "orange") return "var(--color-claude-orange)";
    if (cfg.colorMode === "ink") return "var(--color-claude-ink)";
    var idx = (lower.charCodeAt(0) - 97) % FRIENDLY.length;
    return FRIENDLY[idx < 0 ? 0 : idx];
  };
  Tape.prototype.render = function (lower) {
    var cfg = this.getConfig();
    if (cfg.caseMode === "lower") return lower;
    if (cfg.caseMode === "both") {
      var span = document.createElement("span");
      span.className = "pair";
      span.innerHTML =
        '<span class="pair-u">' + lower.toUpperCase() + "</span>" +
        '<span class="pair-l">' + lower + "</span>";
      return span;
    }
    return lower.toUpperCase();
  };
  Tape.prototype.push = function (lower) {
    var el = document.createElement("span");
    el.className = "letter";
    el.style.color = this.colorFor(lower);
    var content = this.render(lower);
    if (typeof content === "string") el.textContent = content;
    else el.appendChild(content);
    this.track.appendChild(el);

    var gap = parseFloat(getComputedStyle(this.track).columnGap || getComputedStyle(this.track).gap || "0") || 0;
    var w = el.getBoundingClientRect().width + gap;

    var track = this.track;
    track.style.transition = "none";
    track.style.transform = "translateX(" + w + "px)";
    track.getBoundingClientRect(); // force reflow
    track.style.transition = "transform var(--slide-dur) var(--slide-ease)";
    track.style.transform = "translateX(0)";

    if (el.animate) {
      el.animate(
        [
          { opacity: 0, transform: "translateX(18px) scale(0.7)" },
          { opacity: 1, transform: "translateX(0) scale(1)" }
        ],
        { duration: 260, easing: "cubic-bezier(0.2,0,0.1,1)" }
      );
    }
    this.prune();
  };
  Tape.prototype.prune = function () {
    var self = this;
    setTimeout(function () {
      var bound = self.center.getBoundingClientRect().left;
      var kids = self.track.children;
      while (kids.length > 1) {
        var first = kids[0];
        if (first.getBoundingClientRect().right < bound - 4) {
          self.track.removeChild(first);
        } else break;
      }
    }, 360);
  };
  Tape.prototype.isEmpty = function () {
    return this.track.children.length === 0;
  };
  Tape.prototype.clear = function () {
    var track = this.track;
    var kids = Array.prototype.slice.call(track.children);
    if (!kids.length) return;
    kids.forEach(function (k) {
      if (k.animate) {
        var a = k.animate(
          [{ opacity: 1 }, { opacity: 0, transform: "translateY(-8px) scale(0.92)" }],
          { duration: 320, easing: "ease-out", fill: "forwards" }
        );
        a.onfinish = function () { if (k.parentNode) k.parentNode.removeChild(k); };
      } else if (k.parentNode) {
        k.parentNode.removeChild(k);
      }
    });
    setTimeout(function () {
      track.innerHTML = "";
      track.style.transition = "none";
      track.style.transform = "translateX(0)";
    }, 360);
  };

  /* ---------- The controller ---------- */
  function Controller(opts) {
    this.tape = new Tape(opts.centerEl, opts.trackEl, opts.getConfig);
    this.getConfig = opts.getConfig;
    this.onState = opts.onState || function () {};
    this.onLevel = opts.onLevel || function () {};
    this.onMode = opts.onMode || function () {};
    this.onError = opts.onError || function () {};

    this.currentLetter = null;
    this.speaking = false;
    this.manual = false;
    this.lastEmit = 0;
    this.repeatTimer = null;
    this.burstTimer = null;
    this.running = false;
    this.micOn = false;
    this.mode = "prompt";

    this._bindKeyboard();
    this._tickSilence();
  }

  Controller.prototype._setMode = function (m) {
    if (this.mode === m) return;
    this.mode = m;
    this.onMode(m);
  };

  Controller.prototype.emit = function () {
    if (!this.currentLetter) return;
    this.tape.push(this.currentLetter);
    this.lastEmit = Date.now();
    this._setMode("active");
    var cfg = this.getConfig();
    if (cfg.vibrate && navigator.vibrate) {
      try { navigator.vibrate(cfg.vibrateMs || 18); } catch (e) {}
    }
  };

  Controller.prototype._startRepeat = function () {
    if (this.repeatTimer) return;
    var self = this;
    if (self.currentLetter) self.emit();
    this.repeatTimer = setInterval(function () {
      var cfg = self.getConfig();
      if ((self.speaking || self.manual) && self.currentLetter) {
        self.emit();
      }
      if (self._repeatMs !== cfg.repeatMs) self._restartRepeat();
    }, this._repeatMs = this.getConfig().repeatMs);
  };
  Controller.prototype._restartRepeat = function () {
    this._stopRepeat();
    this._startRepeat();
  };
  Controller.prototype._stopRepeat = function () {
    if (this.repeatTimer) { clearInterval(this.repeatTimer); this.repeatTimer = null; }
  };

  Controller.prototype._onSpeakingChange = function (now) {
    if (now === this.speaking) return;
    this.speaking = now;
    if (now) {
      this._stopBurst();
      if (this.currentLetter) this._startRepeat();
    } else {
      this._stopRepeat();
    }
  };

  Controller.prototype.setLetter = function (c, burstN) {
    if (!c) return;
    var changed = c !== this.currentLetter;
    this.currentLetter = c;
    if (this.speaking || this.manual) {
      if (!this.repeatTimer) this._startRepeat();
      else if (changed) this.emit();
      return;
    }
    // A final result after the sound ended: if the sound produced no
    // letters while it was live (no interim results on this platform),
    // replay it as a burst sized by what was actually heard — never by
    // elapsed time, which overcounts when recognition needed several
    // attempts to understand the sound.
    if (burstN && Date.now() - this.lastEmit > this.getConfig().repeatMs * 1.5) {
      this._burst(Math.min(8, Math.max(1, burstN)), this.getConfig().repeatMs);
    }
  };

  Controller.prototype._burst = function (n, ms) {
    var self = this;
    this._stopBurst();
    this.emit();
    if (--n <= 0) return;
    this.burstTimer = setInterval(function () {
      self.emit();
      if (--n <= 0) self._stopBurst();
    }, ms);
  };
  Controller.prototype._stopBurst = function () {
    if (this.burstTimer) { clearInterval(this.burstTimer); this.burstTimer = null; }
  };

  Controller.prototype._tickSilence = function () {
    var self = this;
    setInterval(function () {
      var cfg = self.getConfig();
      if (self.tape.isEmpty()) { self._setMode("prompt"); return; }
      var idle = Date.now() - self.lastEmit;
      if (!self.speaking && !self.manual && idle > cfg.silenceMs) {
        self.tape.clear();
        self.currentLetter = null;
        self._setMode("prompt");
      }
    }, 400);
  };

  /* ---------- microphone ---------- */
  Controller.prototype.start = function () {
    if (this.running) return Promise.resolve();
    var self = this;
    self.running = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      self.running = false;
      self.onState({ mic: false, denied: true });
      return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        self.micOn = true;
        self.onState({ mic: true });
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var exclusiveMic = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        if (SR && exclusiveMic) {
          // On mobile the OS hands the mic to one consumer at a time;
          // holding this stream starves SpeechRecognition and it never
          // hears anything. Permission is granted now — release the
          // stream and let recognition own the mic. Speaking state and
          // the level bars are driven from recognition events instead.
          stream.getTracks().forEach(function (t) { t.stop(); });
          self._setupRecognition(true);
          self._syntheticLevel();
        } else {
          self._setupAudio(stream);
          if (SR) self._setupRecognition(false);
          else self.onState({ recognition: false });
        }
      })
      .catch(function (err) {
        self.running = false;
        self.micOn = false;
        self.onState({ mic: false, denied: true });
        self.onError(err);
      });
  };

  Controller.prototype._setupAudio = function (stream) {
    var self = this;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ac = new Ctx();
    this.audioCtx = ac;
    var src = ac.createMediaStreamSource(stream);
    var analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    var buf = new Uint8Array(analyser.fftSize);
    var THRESH = 0.045;
    function loop() {
      analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) {
        var v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / buf.length);
      var level = Math.min(1, rms / 0.35);
      self.onLevel(level);
      self._onSpeakingChange(rms > THRESH);
      self._raf = requestAnimationFrame(loop);
    }
    loop();
  };

  Controller.prototype._setupRecognition = function (driveSpeaking) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onState({ recognition: false }); return; }
    var self = this;
    var rec = new SR();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    if (driveSpeaking) {
      rec.onspeechstart = function () { self._onSpeakingChange(true); };
      rec.onspeechend = function () { self._onSpeakingChange(false); };
      rec.onsoundstart = function () { self._onSpeakingChange(true); };
      rec.onsoundend = function () { self._onSpeakingChange(false); };
    }
    rec.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      // an interim result mid-utterance means the user is still talking,
      // even if onspeechstart never fired (support varies per platform);
      // a final result is often delivered after the sound ended and
      // should go through the burst path instead
      if (driveSpeaking && !res.isFinal) self._pokeSpeaking();
      // prefer the alternative that clearly names a letter — Google's
      // first guess for a letter sound is often a lookalike word
      var c = null, t = res[0].transcript;
      for (var i = 0; i < res.length; i++) {
        var s = letterStrict(res[i].transcript);
        if (s) { c = s; t = res[i].transcript; break; }
      }
      if (!c) c = letterFrom(t);
      if (c) self.setLetter(c, res.isFinal ? countFor(t, c) : 0);
    };
    rec.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        self.onState({ recognition: false, denied: true });
      }
    };
    rec.onend = function () {
      if (driveSpeaking) self._onSpeakingChange(false);
      // mobile recognition sessions end on their own; restart with a
      // short pause so a failing start doesn't spin
      if (self.running && self.micOn) {
        setTimeout(function () { try { rec.start(); } catch (e) {} }, 200);
      }
    };
    this.recognition = rec;
    try { rec.start(); this.onState({ recognition: true }); } catch (e) {}
  };

  // interim results arriving = still talking; quiet for ~900ms = stopped
  Controller.prototype._pokeSpeaking = function () {
    var self = this;
    this._onSpeakingChange(true);
    clearTimeout(this._pokeT);
    this._pokeT = setTimeout(function () { self._onSpeakingChange(false); }, 900);
  };

  // without a live audio stream there is no level meter — pulse the
  // bars while recognition reports speech so the UI still feels alive
  Controller.prototype._syntheticLevel = function () {
    var self = this;
    setInterval(function () {
      var lvl = (self.speaking || self.manual)
        ? 0.25 + 0.45 * Math.abs(Math.sin(Date.now() / 130))
        : 0.04;
      self.onLevel(lvl);
    }, 80);
  };

  /* ---------- keyboard fallback ---------- */
  Controller.prototype._bindKeyboard = function () {
    var self = this;
    window.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : "";
      if (k >= "a" && k <= "z") {
        e.preventDefault();
        if (e.repeat) return;
        self.manual = true;
        self.currentLetter = k;
        self._startRepeat();
      }
    });
    window.addEventListener("keyup", function (e) {
      var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : "";
      if (k >= "a" && k <= "z") {
        self.manual = false;
        if (!self.speaking) self._stopRepeat();
      }
    });
  };

  window.LetterController = Controller;
})();
