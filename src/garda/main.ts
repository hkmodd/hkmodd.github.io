/**
 * Entry della pagina /garda.html.
 *
 * Fa una cosa sola: montare il portale su tutto lo schermo. Tutto il resto
 * vive in portal.ts, che non conosce questa pagina — cosi' lo stesso modulo
 * puo' essere importato pigramente dal portfolio senza modifiche.
 */
import './garda.css';
import { mountGarda } from './portal';

const root = document.getElementById('garda') as HTMLElement;
let live: { dispose(): void } | null = null;

// Senza questo, ogni hot-reload lascia in vita il suo requestAnimationFrame:
// dopo cinque salvataggi girano cinque scene e i loop morti riempiono la
// console di errori che sembrano bug del codice nuovo.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    live?.dispose();
    live = null;
  });
}

const boot = document.getElementById('garda-boot') as HTMLElement;
const bootLabel = boot.querySelector('[data-role="phase"]') as HTMLElement;

mountGarda(root, (phase) => {
  bootLabel.textContent = phase;
})
  .then((portal) => {
    live = portal;
    boot.dataset.state = 'done';
    // Non si smonta subito: la dissolvenza deve finire, e un unmount qui
    // ammazzerebbe la transizione a meta'.
    setTimeout(() => boot.remove(), 900);
  })
  .catch((err: unknown) => {
    console.error('[garda]', err);
    boot.dataset.state = 'error';
    bootLabel.textContent = err instanceof Error ? err.message : 'errore di caricamento';
  });
