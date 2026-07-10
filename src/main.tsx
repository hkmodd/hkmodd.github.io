import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// For the ones who open the console. I see you. 🤝
console.log(
  '%c▲ ti vedo.%c\n\n' +
    'You opened the console on a security researcher\'s site — respect.\n' +
    'The background you\'re watching is a GPU-resident neural simulation:\n' +
    'WebGPU compute (TSL) → WASM-in-Worker → WASM fallback, picked live.\n\n' +
    '  `      → engine telemetry overlay\n' +
    '  hud    → same, from the on-site terminal\n' +
    '  ↑↑↓↓←→←→BA … you know what to do.\n\n' +
    'Source: https://github.com/hkmodd/hkmodd.github.io',
  'color:#00d4ff;font-size:16px;font-weight:bold;font-family:monospace',
  'color:#7a7a8e;font-family:monospace;font-size:11px;line-height:1.6',
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
