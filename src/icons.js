// Ícones no estilo do TradingView (traço fino, 24x24) e ícones de ativos (bandeiras / círculos coloridos).
const s = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
export const ICON = {
  x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: s('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  chevD: s('<path d="M7 10l5 5 5-5"/>'),
  chevU: s('<path d="M7 14l5-5 5 5"/>'),
  chevR: s('<path d="M10 7l5 5-5 5"/>'),
  undo: s('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>'),
  redo: s('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6v1"/>'),
  candles: s('<path d="M7 3v3M7 17v4M17 3v6M17 16v5"/><rect x="5" y="6" width="4" height="11" rx="1"/><rect x="15" y="9" width="4" height="7" rx="1"/>'),
  hollow: s('<path d="M7 3v3M7 17v4M17 3v6M17 16v5"/><rect x="5" y="6" width="4" height="11" rx="1"/><rect x="15" y="9" width="4" height="7" rx="1" fill="currentColor" fill-opacity=".45"/>'),
  heikin: s('<path d="M7 3v4M7 16v5M17 5v3M17 17v4"/><rect x="5" y="7" width="4" height="9" rx="1"/><rect x="15" y="8" width="4" height="9" rx="1" fill="currentColor" fill-opacity=".45"/>'),
  bars: s('<path d="M7 4v16M4 8h3M7 15h3M17 3v14M14 6h3M17 13h3"/>'),
  line: s('<path d="M3 17l5-6 4 3 8-9"/>'),
  area: s('<path d="M3 17l5-6 4 3 8-9v13H3z" fill="currentColor" fill-opacity=".25"/><path d="M3 17l5-6 4 3 8-9"/>'),
  fx: s('<path d="M3 17c3 0 3-9 6-9s2 9 6 9 3-8 6-8"/><path d="M3 21h18"/>'),
  indicators: s('<path d="M4 17l4-5 3 3 5-8 4 4"/><path d="M4 21h16"/>'),
  replay: s('<path d="M11 6l-7 6 7 6zM20 6l-7 6 7 6z"/>'),
  play: s('<path d="M7 4.5l12 7.5-12 7.5z"/>'),
  playF: s('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>'),
  pauseF: s('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>'),
  step: s('<path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/>'),
  jump: s('<path d="M4 5l7 7-7 7zM11 5l7 7-7 7M21 5v14"/>'),
  pickbar: s('<path d="M4 4v16"/><path d="M9 12h12M13 8l-4 4 4 4"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  eye: s('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: s('<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.4 9.4 0 0 0 5.4-1.6"/>'),
  code: s('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>'),
  trash: s('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  lock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  magnet: s('<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/>'),
  zoom: s('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 8v5M8 10.5h5"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  pencil: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  dots: s('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  menuH: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  star: s('<path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z"/>'),
  starF: s('<path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z" fill="currentColor"/>'),
  calendar: s('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  scissors: '<svg viewBox="0 0 24 24" style="fill:#fff;stroke:#000;stroke-width:1.1"><circle cx="7" cy="18" r="3"/><circle cx="17" cy="18" r="3"/><path d="M8.6 15.4L16 3M15.4 15.4L8 3"/></svg>',
  grip: s('<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>'),
  list: s('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  bookmark: s('<path d="M6 3h12v18l-6-4.5L6 21z"/><path d="M9 8h6M9 12h6"/>'),
  chartTab: s('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M7 15l3.5-4 3 2.5L17 9"/>'),
  scripts: s('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>'),
  menuTab: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  camera: s('<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  moon: s('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  swap: s('<path d="M7 4v14M4 15l3 3 3-3M17 20V6M14 9l3-3 3 3"/>'),
  sync: s('<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>'),
};

// ---- ícones de ativos ----
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿', BRL: '🇧🇷', MXN: '🇲🇽', CNH: '🇨🇳', CNY: '🇨🇳', SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', PLN: '🇵🇱', TRY: '🇹🇷', ZAR: '🇿🇦', SGD: '🇸🇬', HKD: '🇭🇰', CZK: '🇨🇿', HUF: '🇭🇺', THB: '🇹🇭', INR: '🇮🇳', DE: '🇩🇪', US: '🇺🇸', GB: '🇬🇧', JP: '🇯🇵', AU: '🇦🇺', CA: '🇨🇦', CH: '🇨🇭', NZ: '🇳🇿' };
const SPECIAL = [
  [/^(US30|DJI|WS30)/, '30', '#1e9bf0'], [/^(NAS100|US100|USTEC)/, '100', '#00a3d4'], [/^(SPX500|US500)/, '500', '#e0273d'],
  [/^(DE30|DE40|GER)/, '40', '#f5a623'], [/^UK100/, '100', '#7e57c2'], [/^JP225/, '225', '#e53935'], [/^(XAU)/, 'Au', '#f2b01e'], [/^XAG/, 'Ag', '#9aa3b2'],
  [/^(WTI|USOIL|BCO|UKOIL)/, 'Oil', '#455a64'], [/^BTC/, '₿', '#f7931a'], [/^ETH/, 'Ξ', '#627eea'], [/^(EU50|FR40|AU200|HK)/, '50', '#26a69a'],
];
const hue = str => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// devolve o HTML do ícone (um ou dois círculos sobrepostos)
export function symIcon(name, size = 28) {
  const raw = String(name); const yl = /^([A-Z]{2})10Y$/.exec(raw);
  const circle = (txt, bg, emoji, cls = '') => `<i class="ci ${cls}" style="${bg ? `background:${bg};` : ''}${emoji ? '' : 'color:#fff;'}">${txt}</i>`;
  if (yl) return `<span class="sico" style="--sz:${size}px">${circle(FLAG[yl[1]] || yl[1], '#2a2e39', true)}</span>`;
  const sp = SPECIAL.find(x => x[0].test(raw.replace('_', '')));
  if (sp) return `<span class="sico" style="--sz:${size}px">${circle(sp[1], sp[2])}</span>`;
  const m = /^([A-Z]{3})_?([A-Z]{3})$/.exec(raw);
  if (m && FLAG[m[1]] && FLAG[m[2]]) return `<span class="sico two" style="--sz:${size}px">${circle(FLAG[m[1]], '#2a2e39', true, 'a')}${circle(FLAG[m[2]], '#2a2e39', true, 'b')}</span>`;
  return `<span class="sico" style="--sz:${size}px">${circle(raw.slice(0, 2), `hsl(${hue(raw)} 55% 42%)`)}</span>`;
}
