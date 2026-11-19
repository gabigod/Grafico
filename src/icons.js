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
  bell: s('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  sync: s('<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>'),
  fullscreen: s('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  crosshair: s('<path d="M12 2v7M12 15v7M2 12h7M15 12h7"/><circle cx="12" cy="12" r="1"/>'),
  pointer: s('<path d="M5 3l14 8-6 1.5L10 19z"/>'),
  cloud: s('<path d="M7 19h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.1A4.6 4.6 0 0 0 7 19z"/><path d="M9 14l2 2 4-4"/>'),
};

// ---- ícones de ativos ----
// Bandeiras vetoriais locais evitam depender da fonte de emoji do aparelho.
const FLAG_ART = {
  EUR: '<rect width="24" height="24" fill="#1746a2"/><g fill="#ffd54f"><circle cx="12" cy="5" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="17" cy="17" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="7" cy="17" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="7" cy="7" r="1"/></g>',
  USD: '<rect width="24" height="24" fill="#fff"/><path d="M0 2h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0z" fill="#d93a49"/><path d="M0 0h11v12H0z" fill="#264b92"/><g fill="#fff"><circle cx="3" cy="3" r=".7"/><circle cx="7" cy="3" r=".7"/><circle cx="5" cy="6" r=".7"/><circle cx="3" cy="9" r=".7"/><circle cx="8" cy="9" r=".7"/></g>',
  GBP: '<rect width="24" height="24" fill="#21468b"/><path d="M0 0l24 24M24 0L0 24" stroke="#fff" stroke-width="5"/><path d="M0 0l24 24M24 0L0 24" stroke="#db3347" stroke-width="2"/><path d="M12 0v24M0 12h24" stroke="#fff" stroke-width="7"/><path d="M12 0v24M0 12h24" stroke="#db3347" stroke-width="3"/>',
  JPY: '<rect width="24" height="24" fill="#fff"/><circle cx="12" cy="12" r="6" fill="#d63043"/>',
  AUD: '<rect width="24" height="24" fill="#173c83"/><path d="M0 0l11 9M11 0L0 9" stroke="#fff" stroke-width="2"/><path d="M5.5 0v10M0 5h11" stroke="#fff" stroke-width="3"/><path d="M5.5 0v10M0 5h11" stroke="#e4374c" stroke-width="1.3"/><g fill="#fff"><circle cx="17" cy="7" r="1"/><circle cx="19" cy="13" r="1"/><circle cx="15" cy="17" r="1.2"/><circle cx="8" cy="18" r="1.4"/></g>',
  NZD: '<rect width="24" height="24" fill="#173c83"/><path d="M0 0l11 9M11 0L0 9" stroke="#fff" stroke-width="2"/><path d="M5.5 0v10M0 5h11" stroke="#fff" stroke-width="3"/><path d="M5.5 0v10M0 5h11" stroke="#e4374c" stroke-width="1.3"/><g fill="#ef495b" stroke="#fff" stroke-width=".6"><circle cx="17" cy="7" r="1.3"/><circle cx="19" cy="13" r="1.3"/><circle cx="15" cy="17" r="1.3"/></g>',
  CAD: '<rect width="24" height="24" fill="#fff"/><path d="M0 0h6v24H0zm18 0h6v24h-6z" fill="#e43948"/><path d="M12 4l1.2 3 1.7-1-.3 3 2 1-2 1.6 1 2-2.6-.4L12 19l-1-5.8-2.6.4 1-2-2-1.6 2-1-.3-3 1.7 1z" fill="#e43948"/>',
  CHF: '<rect width="24" height="24" fill="#e43746"/><path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z" fill="#fff"/>',
  BRL: '<rect width="24" height="24" fill="#159447"/><path d="M12 3l10 9-10 9L2 12z" fill="#f7d43b"/><circle cx="12" cy="12" r="5" fill="#2252a4"/><path d="M7 11c3-1 7 0 10 2" stroke="#fff" stroke-width="1"/>',
};
const FLAG_ALIAS = { US: 'USD', GB: 'GBP', JP: 'JPY', AU: 'AUD', CA: 'CAD', CH: 'CHF', NZ: 'NZD' };
const SPECIAL = [
  [/^(US30|DJI|WS30)/, '30', '#1e9bf0'], [/^(NAS100|US100|USTEC)/, '100', '#00a3d4'], [/^(SPX500|US500)/, '500', '#e0273d'],
  [/^(DE30|DE40|GER)/, '40', '#f5a623'], [/^UK100/, '100', '#7e57c2'], [/^JP225/, '225', '#e53935'], [/^(XAU)/, 'Au', '#f2b01e'], [/^XAG/, 'Ag', '#9aa3b2'],
  [/^(WTI|USOIL|BCO|UKOIL)/, 'Oil', '#455a64'], [/^BTC/, '₿', '#f7931a'], [/^ETH/, 'Ξ', '#627eea'], [/^(EU50|FR40|AU200|HK)/, '50', '#26a69a'],
];
const hue = str => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// devolve o HTML do ícone (um ou dois círculos sobrepostos)
export function symIcon(name, size = 28) {
  const raw = String(name); const yl = /^([A-Z]{2})10Y$/.exec(raw);
  const circle = (txt, bg, cls = '') => `<i class="ci ${cls}" style="background:${bg};color:#fff">${txt}</i>`;
  const flag = (code, cls = '') => {
    const art = FLAG_ART[FLAG_ALIAS[code] || code];
    return art ? `<i class="ci flag ${cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${art}</svg></i>` : circle(code.slice(0, 2), `hsl(${hue(code)} 45% 38%)`, cls);
  };
  if (yl) return `<span class="sico" style="--sz:${size}px" aria-hidden="true">${flag(yl[1])}</span>`;
  const sp = SPECIAL.find(x => x[0].test(raw.replace('_', '')));
  if (sp) return `<span class="sico" style="--sz:${size}px" aria-hidden="true">${circle(sp[1], sp[2])}</span>`;
  const m = /^([A-Z]{3})_?([A-Z]{3})$/.exec(raw);
  if (m) return `<span class="sico two" style="--sz:${size}px" aria-hidden="true">${flag(m[1], 'a')}${flag(m[2], 'b')}</span>`;
  const initials = raw.replace(/[^A-Z0-9]/gi, '').slice(0, 2) || '?';
  return `<span class="sico" style="--sz:${size}px" aria-hidden="true">${circle(initials, `hsl(${hue(raw)} 55% 42%)`)}</span>`;
}
