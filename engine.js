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
  function lastLetter(transcript) {
    var t = stripDiacritics(String(transcript || "").toLowerCase());
    for (var i = t.length - 1; i >= 0; i--) {
      var c = t[i];
      if (c >= "a" && c <= "z") return c;
    }
    return null;
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
      if (this.currentLetter) this._startRepeat();
    } else {
      this._stopRepeat();
    }
  };

  Controller.prototype.setLetter = function (c) {
    if (!c) return;
    var changed = c !== this.currentLetter;
    this.currentLetter = c;
    if ((this.speaking || this.manual)) {
      if (!this.repeatTimer) this._startRepeat();
      else if (changed) this.emit();
    }
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
        self._setupAudio(stream);
        self._setupRecognition();
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

  Controller.prototype._setupRecognition = function () {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onState({ recognition: false }); return; }
    var self = this;
    var rec = new SR();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      var c = lastLetter(res[0].transcript);
      if (c) self.setLetter(c);
    };
    rec.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        self.onState({ recognition: false, denied: true });
      }
    };
    rec.onend = function () {
      if (self.running && self.micOn) {
        try { rec.start(); } catch (e) {}
      }
    };
    this.recognition = rec;
    try { rec.start(); this.onState({ recognition: true }); } catch (e) {}
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
