"use client";

// GSAP driver for the landing page. Mounted once; selects page-wide elements by
// data-attributes (added in app/page.tsx) and wires:
//  - [data-split]    headline chars rise in (SplitText)
//  - [data-reveal]   section fades/slides up on scroll (ScrollTrigger)
//  - [data-count]    number counts up when scrolled into view
//  - [data-magnetic] element pulls toward the cursor (quickTo)

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

export function LandingGsap() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const splits: SplitText[] = [];

    const ctx = gsap.context(() => {
      // headline reveal
      document.querySelectorAll<HTMLElement>("[data-split]").forEach((h) => {
        const s = new SplitText(h, { type: "chars,words" });
        splits.push(s);
        gsap.from(s.chars, {
          yPercent: 120,
          opacity: 0,
          ease: "power3.out",
          duration: 0.7,
          stagger: 0.018,
          delay: 0.1,
        });
      });

      // count-up numbers
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const to = parseFloat(el.dataset.count || "0");
        const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
        const dp = parseInt(el.dataset.dp || "0", 10);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: to,
          duration: 1.5,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
          onUpdate: () => {
            el.textContent = prefix + obj.v.toFixed(dp) + suffix;
          },
        });
      });

      // magnetic buttons
      gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((btn) => {
        const xTo = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3" });
        const yTo = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3" });
        const move = (e: MouseEvent) => {
          const r = btn.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
          yTo((e.clientY - (r.top + r.height / 2)) * 0.55);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        btn.addEventListener("mousemove", move);
        btn.addEventListener("mouseleave", leave);
        cleanups.push(() => {
          btn.removeEventListener("mousemove", move);
          btn.removeEventListener("mouseleave", leave);
        });
      });
    });

    return () => {
      ctx.revert();
      cleanups.forEach((c) => c());
      splits.forEach((s) => s.revert());
    };
  }, []);

  return null;
}
