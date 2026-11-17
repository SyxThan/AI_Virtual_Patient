/**
 * Setup -> Clinical Workspace hand-off with the View Transitions API: the case
 * cover (`view-transition-name: patient-stage`) grows into the workspace's 3D
 * stage box, which carries the same name; everything else cross-fades.
 * Timing and reduced-motion rules live in globals.css (::view-transition-*).
 *
 * The workspace first fetches the session, so the transition waits (capped)
 * until the stage box is in the DOM. Browsers without the API navigate normally.
 */

export const STAGE_TRANSITION_NAME = "patient-stage";
/** Selector of the element that carries the name on both pages. */
export const STAGE_SELECTOR = "[data-stage-transition]";
const MAX_WAIT_MS = 1500; // bounds how long the old page stays frozen

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

function waitForStage(fromEl: Element | null): Promise<void> {
  return new Promise((resolve) => {
    const found = () => {
      const el = document.querySelector(STAGE_SELECTOR);
      return el !== null && el !== fromEl && el.isConnected;
    };
    if (found()) return resolve();
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (found()) done();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(done, MAX_WAIT_MS);
  });
}

export function navigateToStage(push: (href: string) => void, href: string): void {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition) {
    push(href);
    return;
  }
  const fromEl = document.querySelector(STAGE_SELECTOR);
  doc.startViewTransition(() => {
    push(href);
    return waitForStage(fromEl);
  });
}
