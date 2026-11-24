"use strict";

const revealElements = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const delay = Number(entry.target.dataset.delay) || 0;
      window.setTimeout(() => entry.target.classList.add("is-visible"), delay);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -36px 0px" });

  revealElements.forEach((element) => revealObserver.observe(element));
}

document.querySelectorAll(".feature-card, .preview-card, .how-board").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || reduceMotion) return;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    card.style.setProperty("--pointer-x", `${x * 9}px`);
    card.style.setProperty("--pointer-y", `${y * 7}px`);
  });
  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--pointer-x", "0px");
    card.style.setProperty("--pointer-y", "0px");
  });
});

document.querySelectorAll("#landing-signin").forEach((button) => {
  button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("stockwise:signin")));
});

["#landing-get-started", "#hero-get-started", "#how-get-started", "#footer-get-started"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => window.dispatchEvent(new CustomEvent("stockwise:signup")));
});

