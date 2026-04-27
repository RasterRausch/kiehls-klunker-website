// Wiederverwendbarer horizontaler Slider mit Drag-to-Scroll + Pfeil-Buttons.
// Wird vom Home-Products-Slider, Home-Reviews-Slider und PDP-Thumb-Strip genutzt.
//
// Verwendung im Page-Script:
//   import { initHorizontalSlider } from '../scripts/horizontal-slider';
//   initHorizontalSlider({
//     sliderId: 'product-slider',
//     prevSelector: '[data-slider-prev]',
//     nextSelector: '[data-slider-next]',
//     cardSelector: '.product-card',
//   });

type Options = {
  sliderId: string;
  prevSelector: string;
  nextSelector: string;
  cardSelector: string;
  // Wie viele Karten weit ein Klick auf einen Pfeil scrollt (default: 1).
  stepCards?: number;
  // Optional: Selector für das Inner-Flex-Element, dessen `gap` wir lesen.
  // Default: erstes Kind des Sliders mit Klasse 'flex'.
  innerSelector?: string;
};

export function initHorizontalSlider(opts: Options): void {
  const slider = document.getElementById(opts.sliderId);
  if (!slider) return;

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepCards = opts.stepCards ?? 1;

  // ——— Drag-to-scroll ———
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let dragDistance = 0;

  slider.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDown = true;
    dragDistance = 0;
    startX = e.pageX;
    startScroll = slider.scrollLeft;
    slider.classList.add('is-dragging');
  });
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDown) return;
    const walk = e.pageX - startX;
    dragDistance = Math.abs(walk);
    slider.scrollLeft = startScroll - walk;
  });
  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;
    // 50ms Delay, damit der Drag-Click-Filter unten noch greift
    setTimeout(() => slider.classList.remove('is-dragging'), 50);
  });

  // Klick nach Drag > 5px unterdrücken (sonst navigiert ein Card-Link nach Drag)
  slider.addEventListener(
    'click',
    (e) => {
      if (dragDistance > 5) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // ——— Step-Berechnung ———
  const getStep = (): number => {
    const card = slider.querySelector(opts.cardSelector) as HTMLElement | null;
    if (!card) return slider.clientWidth * 0.8;
    const inner = opts.innerSelector
      ? slider.querySelector(opts.innerSelector)
      : slider.querySelector('.flex');
    const gap = inner ? parseInt(getComputedStyle(inner).gap || '24', 10) : 24;
    return (card.getBoundingClientRect().width + gap) * stepCards;
  };

  // ——— Pfeil-Buttons ———
  const scrollByStep = (dir: 1 | -1) => {
    slider.scrollBy({
      left: dir * getStep(),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };
  document
    .querySelectorAll(opts.nextSelector)
    .forEach((b) => b.addEventListener('click', () => scrollByStep(1)));
  document
    .querySelectorAll(opts.prevSelector)
    .forEach((b) => b.addEventListener('click', () => scrollByStep(-1)));

  // ——— Pfeile am Rand ausblenden ———
  const updateNavState = () => {
    const atStart = slider.scrollLeft <= 4;
    const atEnd =
      slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 4;
    document
      .querySelectorAll(opts.prevSelector)
      .forEach((b) => b.classList.toggle('is-hidden', atStart));
    document
      .querySelectorAll(opts.nextSelector)
      .forEach((b) => b.classList.toggle('is-hidden', atEnd));
  };
  slider.addEventListener('scroll', updateNavState, { passive: true });
  window.addEventListener('resize', updateNavState);
  updateNavState();
}
