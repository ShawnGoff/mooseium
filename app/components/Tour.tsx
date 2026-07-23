"use client";

// A lightweight guided tour: dims the page, highlights one target at a time,
// and anchors a tooltip to it with Back / Next / Skip. Targets are CSS
// selectors (use data-tour="…" on elements). A step with no on-screen target is
// auto-skipped — so desktop-vs-mobile differences (nav vs. hamburger) just work.
// A step can run an `action` first (e.g. a demo search) and we then poll for its
// target to appear. Completion is remembered in localStorage per `storageKey`.

import { useCallback, useEffect, useRef, useState } from "react";

export type TourStep = {
  target?: string; // CSS selector; omit for a centered message step
  title: string;
  body: string;
  action?: () => void | Promise<void>; // runs before the step is shown
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export default function Tour({
  steps,
  storageKey,
  autoStart = false,
  startSignal = 0,
  welcome,
  onClose,
}: {
  steps: TourStep[];
  storageKey: string;
  autoStart?: boolean;
  startSignal?: number; // bump to force-start (replay)
  // When set, first-timers see this opt-in prompt instead of the tour launching
  // straight away. They choose to take it or skip.
  welcome?: { title: string; body: string; yes: string; no: string };
  onClose?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [asking, setAsking] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cancelled = useRef(false);

  const done = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setRunning(false);
    setRect(null);
    onClose?.();
  }, [storageKey, onClose]);

  // First-timers: either show the opt-in welcome, or (if no welcome prop) launch
  // straight into the tour.
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try {
      seen = localStorage.getItem(storageKey) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = setTimeout(() => {
      if (welcome) setAsking(true);
      else {
        setI(0);
        setRunning(true);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [autoStart, storageKey, welcome]);

  function declineWelcome() {
    setAsking(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    onClose?.();
  }
  function acceptWelcome() {
    setAsking(false);
    setI(0);
    setRunning(true);
  }

  // Replay trigger (skips the welcome — an explicit request).
  useEffect(() => {
    if (startSignal > 0) {
      setAsking(false);
      setI(0);
      setRunning(true);
    }
  }, [startSignal]);

  // Resolve the current step's target (running its action, then polling).
  useEffect(() => {
    if (!running) return;
    cancelled.current = false;
    const step = steps[i];
    if (!step) return done();

    let raf = 0;
    (async () => {
      try {
        await step.action?.();
      } catch {
        /* ignore action errors */
      }
      if (cancelled.current) return;

      if (!step.target) {
        setRect(null); // centered message step
        return;
      }

      const start = Date.now();
      const poll = () => {
        if (cancelled.current) return;
        const el = document.querySelector(step.target!) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        if (el && r && r.width > 0 && r.height > 0) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          requestAnimationFrame(() => {
            const rr = el.getBoundingClientRect();
            setRect({ top: rr.top, left: rr.left, width: rr.width, height: rr.height });
          });
          return;
        }
        // Give an action-driven target a few seconds to appear, else skip.
        if (Date.now() - start > 4000) {
          setI((prev) => (prev + 1 <= steps.length - 1 ? prev + 1 : prev));
          if (i >= steps.length - 1) done();
          return;
        }
        raf = requestAnimationFrame(poll);
      };
      poll();
    })();

    return () => {
      cancelled.current = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i]);

  // Keep the highlight aligned on scroll/resize.
  useEffect(() => {
    if (!running) return;
    const step = steps[i];
    if (!step?.target) return;
    const update = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i]);

  if (asking && welcome) {
    return (
      <div className="tour-root" role="dialog" aria-modal="true">
        <div className="tour-scrim" onClick={declineWelcome} />
        <div
          className="tour-tip tour-welcome"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: Math.min(380, window.innerWidth - 24),
          }}
        >
          <h3>{welcome.title}</h3>
          <p>{welcome.body}</p>
          <div className="tour-actions">
            <button className="tour-back" onClick={declineWelcome}>
              {welcome.no}
            </button>
            <button className="tour-next" onClick={acceptWelcome}>
              {welcome.yes}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!running) return null;
  const step = steps[i];
  if (!step) return null;

  const last = i === steps.length - 1;

  // Tooltip placement: below the target if there's room, else above; centered
  // when there's no target.
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 12;
    const room = window.innerHeight - below > 200;
    const width = Math.min(340, window.innerWidth - 24);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    tipStyle = room
      ? { top: below, left, width }
      : { bottom: window.innerHeight - rect.top + 12, left, width };
  } else {
    tipStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(340, window.innerWidth - 24),
    };
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true">
      <div className="tour-scrim" onClick={done} />
      {rect && (
        <div
          className="tour-ring"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}
      <div className="tour-tip" style={tipStyle}>
        <div className="tour-tip-head">
          <span className="tour-count">
            {i + 1} / {steps.length}
          </span>
          <button className="tour-skip" onClick={done}>
            Skip
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button
            className="tour-back"
            onClick={() => setI((p) => Math.max(0, p - 1))}
            disabled={i === 0}
          >
            Back
          </button>
          <button
            className="tour-next"
            onClick={() => (last ? done() : setI((p) => p + 1))}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
