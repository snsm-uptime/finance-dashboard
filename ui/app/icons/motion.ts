/**
 * Shared motion for animated glyphs and the chrome around them.
 *
 * `MOTION_DURATION_MS` is read by the glyph morph (FileImportMorphIcon) and by
 * the chrome it sits inside (UploadButton's lift, fill, outline, and shadow),
 * so they start and land together instead of drifting apart. One knob: change
 * it here and both follow. Sibling of `stroke.ts`, same reason -- a value two
 * components must agree on does not belong inside either of them.
 *
 * `motionEase` is the JS-side curve, for glyphs driven frame by frame rather
 * than by a CSS transition. It approximates -- deliberately, not exactly --
 * the ease-in-out Tailwind's `transition-all` applies to the chrome
 * (`cubic-bezier(0.4, 0, 0.2, 1)`). Close enough that the two read as one
 * movement; if a glyph ever needs them to match frame for frame, both sides
 * have to move to the same explicit bezier.
 */
export const MOTION_DURATION_MS = 300;

/** easeInOutCubic over normalized progress `p` in [0, 1]. */
export const motionEase = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
