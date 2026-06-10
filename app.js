/* Lettertjes leren — React app, compiled from JSX */
(function () {
  "use strict";
  const { useState, useRef, useEffect } = React;
  const h = React.createElement;

  const CASE_MAP = { "ABC": "upper", "abc": "lower", "Aa": "both" };
  const COLOR_MAP = { "Elke letter": "multi", "Oranje": "orange", "Inkt": "ink" };

  const TWEAK_DEFAULTS = {
    "letterCase": "ABC",
    "colors": "Elke letter",
    "font": "Baloo 2",
    "vibrate": true,
    "letterSize": 42,
    "silence": 3,
    "tempo": 220
  };

  function MicIcon() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
                      strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('rect', { x: '9', y: '2.5', width: '6', height: '11', rx: '3' }),
      h('path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }),
      h('path', { d: 'M12 17.5V21' }),
      h('path', { d: 'M8.5 21h7' })
    );
  }

  function App() {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const tRef = useRef(t);
    tRef.current = t;

    const [mode, setMode] = useState("prompt");
    const [mic, setMic] = useState("idle"); // idle | on | denied
    const centerRef = useRef(null);
    const trackRef = useRef(null);
    const ctrlRef = useRef(null);
    const barsRef = useRef([]);

    useEffect(() => {
      const getConfig = () => {
        const c = tRef.current;
        return {
          caseMode: CASE_MAP[c.letterCase] || "upper",
          colorMode: COLOR_MAP[c.colors] || "multi",
          vibrate: !!c.vibrate,
          vibrateMs: 18,
          silenceMs: (c.silence || 3) * 1000,
          repeatMs: c.tempo || 220
        };
      };
      const ctrl = new window.LetterController({
        centerEl: centerRef.current,
        trackEl: trackRef.current,
        getConfig,
        onMode: (m) => setMode(m),
        onState: (s) => {
          if (s.mic === true) setMic("on");
          if (s.recognition === false && !s.denied) setMic("norec");
          if (s.denied) setMic("denied");
        },
        onLevel: (lvl) => {
          const bars = barsRef.current;
          for (let i = 0; i < bars.length; i++) {
            if (!bars[i]) continue;
            const jitter = 0.4 + Math.abs(Math.sin(Date.now() / (90 + i * 40) + i));
            const h2 = Math.max(0.18, Math.min(1, lvl * jitter * 1.6 + 0.12));
            bars[i].style.height = (h2 * 100) + "%";
          }
        }
      });
      ctrlRef.current = ctrl;
    }, []);

    const start = () => {
      if (ctrlRef.current) ctrlRef.current.start();
    };

    const stageStyle = {
      "--kid-font": '"' + (t.font || "Baloo 2") + '"',
      "--letter-size": "min(" + (t.letterSize || 42) + "vh, 58vw)"
    };

    return h('div', { className: 'stage', style: stageStyle },
      h('div', { className: 'track-center', ref: centerRef },
        h('div', { className: 'track', ref: trackRef })
      ),

      h('div', { className: 'prompt' + (mode === 'active' || mic === 'on' ? ' hidden' : '') },
        h('h1', null, 'Welke letter wil je zien?'),
        mic === 'idle' && h('button', { className: 'mic-cta', onClick: start },
          h(MicIcon),
          h('span', null, 'Tik om te luisteren')
        ),
        mic === 'denied' && h('div', { className: 'cta-hint' },
          'Geen microfoon — typ een letter op het toetsenbord.'
        )
      ),

      mic === 'norec' && h('div', { className: 'note' },
        'Spraakherkenning werkt niet in deze browser — typ een letter op het toetsenbord.'
      ),

      h('div', { className: 'listening' + (mic === 'on' ? ' show' : '') },
        h('span', { className: 'eq' },
          ...[0, 1, 2, 3, 4].map((i) =>
            h('i', { key: i, ref: (el) => { barsRef.current[i] = el; } })
          )
        ),
        h('span', null, 'Ik luister…')
      ),

      h(TweaksPanel, null,
        h(TweakSection, { label: 'Letter' }),
        h(TweakRadio, { label: 'Vorm', value: t.letterCase,
                        options: ['ABC', 'abc', 'Aa'],
                        onChange: (v) => setTweak('letterCase', v) }),
        h(TweakSlider, { label: 'Grootte', value: t.letterSize, min: 25, max: 58, step: 1, unit: 'vh',
                         onChange: (v) => setTweak('letterSize', v) }),
        h(TweakSelect, { label: 'Lettertype', value: t.font,
                         options: ['Baloo 2', 'Fredoka', 'Quicksand'],
                         onChange: (v) => setTweak('font', v) }),
        h(TweakSection, { label: 'Kleur' }),
        h(TweakRadio, { label: 'Kleuren', value: t.colors,
                        options: ['Elke letter', 'Oranje', 'Inkt'],
                        onChange: (v) => setTweak('colors', v) }),
        h(TweakSection, { label: 'Gedrag' }),
        h(TweakToggle, { label: 'Trillen bij elke letter', value: t.vibrate,
                         onChange: (v) => setTweak('vibrate', v) }),
        h(TweakSlider, { label: 'Tempo (hoe sneller, hoe lager)', value: t.tempo,
                         min: 120, max: 500, step: 10, unit: 'ms',
                         onChange: (v) => setTweak('tempo', v) }),
        h(TweakSlider, { label: 'Terug naar vraag na stilte', value: t.silence,
                         min: 1, max: 8, step: 1, unit: 's',
                         onChange: (v) => setTweak('silence', v) })
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
