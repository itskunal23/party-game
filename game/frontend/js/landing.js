/** Landing — party game first screen (Jackbox × Apple HIG, not SaaS marketing) */

const STACK_MOMENTS = [
  'Lucky Draw',
  'Bluff Landed',
  'Go Fuck Yourself',
  'Book Complete',
  'Chaos Event',
  'Bullshit!',
];

const TRANSCRIPT_LINES = [
  '"Nandini walked into that bluff clean. Farzi-level confidence on the wrong side."',
  '"Kunal, Mirzapur ke table pe bhi itna obvious GFY nahi bolte the. Three in a row, bhenchod."',
  '"3 misses in a row — Pond Goblin title loading. Paatal Lok case still open."',
  '"Bluff landed. They believed every word. Scam 1992 hustle but the system wasn\'t scammed."',
  '"That bullshit call was wrong. Sacred Games finale mein bhi aisa devastation nahi tha."',
  '"Lucky draw again. System rigged in your favor. Absolute cinema."',
  '"Book complete. Dare time. Bartender noticed. Everyone\'s fucked now."',
  '"Table pe sirf GFY. Toxic couple simulator. Pond laughed in both their faces."',
  '"Comeback token unlocked. Gully Boy energy — apna time aayega. Use it."',
  '"Heat level 5. Mirzapur table shake se pehle. Do something, bhenchod."',
];

export function initLandingMotion() {
  _initFloatCards();
  _initHeroStack();
  _initTranscriptRotation();
  _initRevealObserver();
  _initMechanicsSpread();
  _initExchangeStagger();
}

function _gsap() {
  return typeof gsap !== 'undefined' ? gsap : null;
}

function _initFloatCards() {
  const g = _gsap();
  if (!g) return;
  g.utils.toArray('.lp-float-card').forEach((el, i) => {
    g.to(el, {
      y: `+=${10 + (i % 2) * 6}`,
      x: `+=${(i % 2 === 0 ? 1 : -1) * 8}`,
      rotation: `+=${(i % 2 === 0 ? 2 : -2)}`,
      duration: 4 + i * 0.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: i * 0.3,
    });
  });
  g.to('.lp-glass-orb', {
    scale: 1.06,
    opacity: 0.5,
    duration: 5,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
  });
}

function _initHeroStack() {
  const label = document.getElementById('lp-stack-label');
  const topCard = document.querySelector('.lp-stack-card--1');
  if (!label) return;

  let idx = 0;
  const g = _gsap();

  const cycle = () => {
    idx = (idx + 1) % STACK_MOMENTS.length;
    const next = STACK_MOMENTS[idx];

    if (g && topCard && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      g.to(topCard, {
        y: -18,
        scale: 1.04,
        duration: 0.22,
        ease: 'power2.out',
        onComplete: () => {
          label.textContent = next;
          g.fromTo(topCard,
            { y: 4, scale: 0.98, opacity: 0.85 },
            { y: -12, scale: 1, opacity: 1, duration: 0.35, ease: 'power2.out' }
          );
        },
      });
    } else {
      label.textContent = next;
    }
  };

  setInterval(cycle, 2600);
}

function _initTranscriptRotation() {
  const el = document.getElementById('lp-transcript-text');
  if (!el) return;

  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % TRANSCRIPT_LINES.length;
    el.classList.add('is-fading');
    setTimeout(() => {
      el.textContent = TRANSCRIPT_LINES[idx];
      el.classList.remove('is-fading');
    }, 400);
  }, 3800);
}

function _initRevealObserver() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.lp-reveal').forEach(el => el.classList.add('lp-in-view'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('lp-in-view');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
}

function _initMechanicsSpread() {
  const stage = document.querySelector('.lp-mechanics-stage');
  if (!stage) return;

  if (!('IntersectionObserver' in window)) {
    stage.classList.add('lp-mechanics--spread');
    return;
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      stage.classList.add('lp-mechanics--spread');
      const g = _gsap();
      if (g && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        g.fromTo('.lp-mech-card',
          { scale: 0.92, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.5, stagger: 0.06, ease: 'power2.out', delay: 0.1 }
        );
      }
      obs.unobserve(stage);
    });
  }, { threshold: 0.35 });

  obs.observe(stage);
}

// Animate exchange dialogue lines in staggered when scrolled into view
function _initExchangeStagger() {
  const wrap = document.getElementById('lp-exchange-wrap');
  if (!wrap) return;

  if (!('IntersectionObserver' in window)) {
    wrap.querySelectorAll('.lp-xline').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const lines = wrap.querySelectorAll('.lp-xline');
      const g = _gsap();
      if (g && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        g.to(lines, {
          opacity: 1,
          y: 0,
          duration: 0.38,
          stagger: 0.32,
          ease: 'power2.out',
          delay: 0.15,
        });
      } else {
        lines.forEach(l => { l.style.opacity = '1'; l.style.transform = 'none'; });
      }
      obs.unobserve(wrap);
    });
  }, { threshold: 0.25 });

  obs.observe(wrap);
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
