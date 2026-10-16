// Recursos do navegador: suporte, aviso de celular, tela acesa, notificação, título e música.
import celebrationUrl from './assets/celebracao.mp3?url';

export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad se apresenta como Mac
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac;
}

/** O mínimo para o ffmpeg.wasm rodar. */
export function isSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof Blob === 'function';
}

export function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
  return /Chrome\/|Edg\//.test(navigator.userAgent);
}

// ---------- Tela acesa ----------
let wakeLock: WakeLockSentinel | null = null;
let wantWake = false;

async function acquire() {
  if (!wantWake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    /* sem permissão ou bateria fraca: segue sem */
  }
}

document.addEventListener('visibilitychange', () => {
  if (wantWake && !wakeLock) void acquire();
});

export function keepAwake(on: boolean) {
  wantWake = on;
  if (on) void acquire();
  else {
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
}

// ---------- Sair da página durante a conversão ----------
const beforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = '';
};
export function guardUnload(on: boolean) {
  if (on) window.addEventListener('beforeunload', beforeUnload);
  else window.removeEventListener('beforeunload', beforeUnload);
}

// ---------- Título da aba ----------
export const APP_TITLE = 'Conversor MTS - DLCCS';
export function setTitle(prefix?: string) {
  document.title = prefix ? `${prefix} · Conversor MTS` : APP_TITLE;
}

// ---------- Notificação ----------
const ASKED_KEY = 'conversor-mts:notify-asked';

export function canAskNotification(): boolean {
  if (!('Notification' in window) || Notification.permission !== 'default') return false;
  try {
    return !localStorage.getItem(ASKED_KEY);
  } catch {
    return true;
  }
}

export async function askNotification(): Promise<boolean> {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignorar */
  }
  if (!('Notification' in window)) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'conversor-mts' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* alguns navegadores só aceitam notificações via service worker */
  }
}

// ---------- Música de celebração ----------
let audio: HTMLAudioElement | null = null;
const audioListeners = new Set<(playing: boolean) => void>();

/** Prepara o áudio dentro do clique em Converter, para o navegador permitir tocar depois. */
export function primeCelebration() {
  if (audio) return;
  audio = new Audio(celebrationUrl);
  audio.preload = 'auto';
  audio.volume = 0.75;
  const emit = () => audioListeners.forEach((fn) => fn(!!audio && !audio.paused && !audio.ended));
  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  audio.addEventListener('ended', emit);
  audio.load();
}

export function playCelebration() {
  primeCelebration();
  if (!audio) return;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* bloqueado pelo navegador: sem som, sem erro */
  });
}

export function stopCelebration() {
  if (audio && !audio.paused) audio.pause();
}

export function onCelebrationChange(fn: (playing: boolean) => void) {
  audioListeners.add(fn);
  return () => audioListeners.delete(fn);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
