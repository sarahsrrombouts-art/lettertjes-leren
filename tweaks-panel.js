/* Tweaks panel — compiled from JSX, no Babel needed */
(function () {
  "use strict";
  const { useState, useEffect, useRef, useCallback } = React;
  const h = React.createElement;

  const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}
  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;overflow-wrap:anywhere}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  `;

  function useTweaks(defaults) {
    const [values, setValues] = useState(defaults);
    const setTweak = useCallback((keyOrEdits, val) => {
      const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
        ? keyOrEdits : { [keyOrEdits]: val };
      setValues(prev => ({ ...prev, ...edits }));
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
      window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
    }, []);
    return [values, setTweak];
  }

  function TweaksPanel({ title = 'Tweaks', children }) {
    const [open, setOpen] = useState(false);
    const dragRef = useRef(null);
    const offsetRef = useRef({ x: 16, y: 16 });
    const PAD = 16;

    const clampToViewport = useCallback(() => {
      const panel = dragRef.current;
      if (!panel) return;
      const w = panel.offsetWidth, h2 = panel.offsetHeight;
      const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
      const maxBottom = Math.max(PAD, window.innerHeight - h2 - PAD);
      offsetRef.current = {
        x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
        y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
      };
      panel.style.right = offsetRef.current.x + 'px';
      panel.style.bottom = offsetRef.current.y + 'px';
    }, []);

    useEffect(() => {
      if (!open) return;
      clampToViewport();
      if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', clampToViewport);
        return () => window.removeEventListener('resize', clampToViewport);
      }
      const ro = new ResizeObserver(clampToViewport);
      ro.observe(document.documentElement);
      return () => ro.disconnect();
    }, [open, clampToViewport]);

    useEffect(() => {
      const onMsg = (e) => {
        const t = e?.data?.type;
        if (t === '__activate_edit_mode') setOpen(true);
        else if (t === '__deactivate_edit_mode') setOpen(false);
      };
      window.addEventListener('message', onMsg);
      window.parent.postMessage({ type: '__edit_mode_available' }, '*');
      return () => window.removeEventListener('message', onMsg);
    }, []);

    const dismiss = () => {
      setOpen(false);
      window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
    };

    const onDragStart = (e) => {
      const panel = dragRef.current;
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      const startRight = window.innerWidth - r.right;
      const startBottom = window.innerHeight - r.bottom;
      const move = (ev) => {
        offsetRef.current = {
          x: startRight - (ev.clientX - sx),
          y: startBottom - (ev.clientY - sy),
        };
        clampToViewport();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };

    if (!open) return null;
    return h(React.Fragment, null,
      h('style', null, __TWEAKS_STYLE),
      h('div', { ref: dragRef, className: 'twk-panel', 'data-omelette-chrome': '',
                 style: { right: offsetRef.current.x, bottom: offsetRef.current.y } },
        h('div', { className: 'twk-hd', onMouseDown: onDragStart },
          h('b', null, title),
          h('button', { className: 'twk-x', 'aria-label': 'Close tweaks',
                        onMouseDown: (e) => e.stopPropagation(), onClick: dismiss }, '✕')
        ),
        h('div', { className: 'twk-body' }, children)
      )
    );
  }

  function TweakSection({ label, children }) {
    return h(React.Fragment, null,
      h('div', { className: 'twk-sect' }, label),
      children
    );
  }

  function TweakRow({ label, value, children, inline = false }) {
    return h('div', { className: inline ? 'twk-row twk-row-h' : 'twk-row' },
      h('div', { className: 'twk-lbl' },
        h('span', null, label),
        value != null ? h('span', { className: 'twk-val' }, value) : null
      ),
      children
    );
  }

  function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
    return h(TweakRow, { label, value: `${value}${unit}` },
      h('input', { type: 'range', className: 'twk-slider', min, max, step,
                   value, onChange: (e) => onChange(Number(e.target.value)) })
    );
  }

  function TweakToggle({ label, value, onChange }) {
    return h('div', { className: 'twk-row twk-row-h' },
      h('div', { className: 'twk-lbl' }, h('span', null, label)),
      h('button', { type: 'button', className: 'twk-toggle', 'data-on': value ? '1' : '0',
                    role: 'switch', 'aria-checked': !!value, onClick: () => onChange(!value) },
        h('i', null)
      )
    );
  }

  function TweakRadio({ label, value, options, onChange }) {
    const trackRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const valueRef = useRef(value);
    valueRef.current = value;

    const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
    const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
    const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
    if (!fitsAsSegments) {
      const resolve = (s) => {
        const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
        return m === undefined ? s : typeof m === 'object' ? m.value : m;
      };
      return h(TweakSelect, { label, value, options, onChange: (s) => onChange(resolve(s)) });
    }
    const opts = options.map((o) => typeof o === 'object' ? o : { value: o, label: o });
    const idx = Math.max(0, opts.findIndex((o) => o.value === value));
    const n = opts.length;

    const segAt = (clientX) => {
      const r = trackRef.current.getBoundingClientRect();
      const inner = r.width - 4;
      const i = Math.floor(((clientX - r.left - 2) / inner) * n);
      return opts[Math.max(0, Math.min(n - 1, i))].value;
    };

    const onPointerDown = (e) => {
      setDragging(true);
      const v0 = segAt(e.clientX);
      if (v0 !== valueRef.current) onChange(v0);
      const move = (ev) => {
        if (!trackRef.current) return;
        const v = segAt(ev.clientX);
        if (v !== valueRef.current) onChange(v);
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    return h(TweakRow, { label },
      h('div', { ref: trackRef, role: 'radiogroup',
                 onPointerDown, className: dragging ? 'twk-seg dragging' : 'twk-seg' },
        h('div', { className: 'twk-seg-thumb',
                   style: { left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                            width: `calc((100% - 4px) / ${n})` } }),
        ...opts.map((o) =>
          h('button', { key: o.value, type: 'button', role: 'radio',
                        'aria-checked': o.value === value }, o.label)
        )
      )
    );
  }

  function TweakSelect({ label, value, options, onChange }) {
    return h(TweakRow, { label },
      h('select', { className: 'twk-field', value, onChange: (e) => onChange(e.target.value) },
        ...options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return h('option', { key: v, value: v }, l);
        })
      )
    );
  }

  Object.assign(window, {
    useTweaks, TweaksPanel, TweakSection, TweakRow,
    TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  });
})();
