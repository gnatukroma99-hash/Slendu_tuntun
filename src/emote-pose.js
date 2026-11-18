import { EMOTE_TIME } from './round-extras.js';

export const TAP_TIMES = [.40, .90, 1.40];

// A temporary additive pose. Restore only the nodes it touched, before the
// authoritative bat throw, walking or stun pose takes over on the next frame.
export function emoteRig(model) {
  const { arms = [], ears = [], head, tilt } = model.userData;
  const rest = new Map([...arms, ...ears, head, tilt].filter(Boolean).map((node) => [node, node.rotation.clone()]));
  let posed = false;
  const restore = () => { if (posed) for (const [node, r] of rest) node.rotation.copy(r); posed = false; };
  return {
    restore,
    pose(kind, time, reduced = false) {
      restore(); if (!(time >= 0 && time < EMOTE_TIME)) return;
      const t = reduced ? .94 : time, env = Math.min(1, t / .23, (EMOTE_TIME - t) / .34);
      const rot = (node, x, y, z) => { if (!node) return; const r = rest.get(node); node.rotation.set(r.x + env*x, r.y + env*y, r.z + env*z, r.order); };
      if (kind === 'taps') {
        const knock = TAP_TIMES.reduce((v, beat) => Math.max(v, Math.exp(-((t - beat) ** 2) / .009)), 0);
        rot(arms[1], -.85 + knock * 1.14, -.28, .24); rot(arms[0], -.15, 0, -.12); rot(head, knock * .06, -.10, 0);
      } else if (kind === 'flex') {
        rot(arms[0], -.65, -.18, 1.65); rot(arms[1], -.85, .24, -1.72);
        rot(head, -.07, -.35 + Math.cos(t * 2.5) * .15, .10); rot(tilt, -.035, .09, 0);
      } else if (kind === 'ears') {
        ears.forEach((ear, i) => rot(ear, 2.42, 0, (i ? -1 : 1) * .20));
        arms.forEach((arm, i) => rot(arm, -1.97, 0, (i ? -1 : 1) * .43)); rot(head, .13, .09, 0);
      } else {
        rot(arms[1], -.50, -.23, 2.48 + .29 * Math.sin(t * 12)); rot(head, -.04, .14, -.08);
      }
      posed = true;
    },
  };
}
