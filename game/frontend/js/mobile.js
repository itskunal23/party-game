let wakeLock = null;

export function initMobile() {
  // Safe area insets via CSS env() — also expose as JS vars
  const root = document.documentElement;
  root.style.setProperty('--safe-top', 'env(safe-area-inset-top)');
  root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom)');
  root.style.setProperty('--safe-left', 'env(safe-area-inset-left)');
  root.style.setProperty('--safe-right', 'env(safe-area-inset-right)');

  // Prevent double-tap zoom on buttons
  document.addEventListener('touchend', e => {
    if (e.target.closest('button, .card, .card-btn')) e.preventDefault();
  }, { passive: false });

  // Disable pull-to-refresh / overscroll bounce
  document.body.style.overscrollBehavior = 'none';

  // Fix 100dvh on older iOS
  const setVh = () => root.style.setProperty('--dvh', `${window.innerHeight * 0.01}px`);
  setVh();
  window.addEventListener('resize', setVh);

  // Prevent input zoom on focus (font-size already 16px from CSS; this is a belt-and-suspenders)
  document.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('focus', () => { document.querySelector('meta[name=viewport]').setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover'); });
    inp.addEventListener('blur', () => { document.querySelector('meta[name=viewport]').setAttribute('content', 'width=device-width,initial-scale=1,viewport-fit=cover'); });
  });
}

export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    });
  } catch { /* denied or unsupported */ }
}

export function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

export function haptic(type = 'light') {
  if (!('vibrate' in navigator)) return;
  const patterns = { light: [10], medium: [30], heavy: [50, 30, 50] };
  navigator.vibrate(patterns[type] ?? [10]);
}
