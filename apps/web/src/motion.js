/** Scroll / entrance motion helpers — award-style reveals without heavy libs. */

export function preferReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function wireReveal(root) {
  const nodes = [...root.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;

  // Always show eventually — never leave content stuck at opacity:0
  const revealAll = () => nodes.forEach((n) => n.classList.add("is-in"));

  if (preferReducedMotion()) {
    revealAll();
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting || e.intersectionRatio > 0) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: [0, 0.05, 0.15], rootMargin: "40px 0px 40px 0px" }
  );

  nodes.forEach((n) => io.observe(n));

  // Paint-sync: mark anything already on screen
  requestAnimationFrame(() => {
    nodes.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.top < window.innerHeight + 80 && r.bottom > -40) n.classList.add("is-in");
    });
  });

  // Safety net (slow IO / odd overflow roots)
  setTimeout(revealAll, 900);
}

export function wireHorizontalDrag(scroller) {
  if (!scroller || preferReducedMotion()) return;
  let down = false;
  let startX = 0;
  let scrollLeft = 0;
  scroller.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a,button")) return; // don't steal card taps
    down = true;
    scroller.setPointerCapture(e.pointerId);
    startX = e.clientX;
    scrollLeft = scroller.scrollLeft;
    scroller.classList.add("is-dragging");
  });
  scroller.addEventListener("pointermove", (e) => {
    if (!down) return;
    scroller.scrollLeft = scrollLeft - (e.clientX - startX);
  });
  const up = () => {
    down = false;
    scroller.classList.remove("is-dragging");
  };
  scroller.addEventListener("pointerup", up);
  scroller.addEventListener("pointercancel", up);
}

export function wireAccordions(root) {
  root.querySelectorAll("[data-acc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-acc");
      const panel = root.querySelector(`[data-acc-panel="${id}"]`);
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      panel?.classList.toggle("open", !open);
    });
  });
}
