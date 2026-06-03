/** Landing page motion + join panel — marketing scroll experience */

export function initLandingMotion() {
  if (typeof gsap === 'undefined') return;

  gsap.utils.toArray('.lp-float-card').forEach((el, i) => {
    gsap.to(el, {
      y: `+=${18 + (i % 3) * 8}`,
      x: `+=${(i % 2 === 0 ? 1 : -1) * 12}`,
      rotation: `+=${(i % 2 === 0 ? 4 : -4)}`,
      duration: 3.2 + i * 0.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: i * 0.25
    });
  });

  gsap.to('.lp-glass-orb', {
    scale: 1.08,
    opacity: 0.85,
    duration: 4,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1
  });

  gsap.to('.lp-bartender-art', {
    y: -10,
    duration: 2.8,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1
  });

  gsap.utils.toArray('.lp-fan-card').forEach((el, i) => {
    gsap.fromTo(el,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, delay: 0.08 * i, ease: 'back.out(1.4)' }
    );
  });

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('lp-in-view');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
  }
}

export function wireLandingJoin({ onStart, onJoinToggle, onJoinSubmit }) {
  document.querySelectorAll('[data-lp-start]').forEach(btn => {
    btn.addEventListener('click', onStart);
  });
  document.querySelectorAll('[data-lp-join-toggle]').forEach(btn => {
    btn.addEventListener('click', onJoinToggle);
  });
  $('btn-lp-join-go')?.addEventListener('click', () => {
    const code = $('input-landing-code')?.value ?? '';
    onJoinSubmit(code);
  });
  $('input-landing-code')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-lp-join-go')?.click();
  });
}

function $(id) { return document.getElementById(id); }
