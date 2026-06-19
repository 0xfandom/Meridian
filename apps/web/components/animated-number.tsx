"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

export function AnimatedNumber({
  value,
  dp = 2,
  prefix = "",
  suffix = "",
  compact = false,
  duration = 0.9,
  className,
}: {
  value: number;
  dp?: number;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => {
    const n =
      compact && Math.abs(v) >= 1000
        ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
            v,
          )
        : new Intl.NumberFormat("en-US", {
            minimumFractionDigits: dp,
            maximumFractionDigits: dp,
          }).format(v);
    return prefix + n + suffix;
  });

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, mv, duration]);

  return <motion.span className={className}>{text}</motion.span>;
}
