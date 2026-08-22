/**
 * Shared duration for the upload control's hover motion, in ms.
 *
 * The glyph morph (FileImportMorphIcon) and the chrome it sits inside
 * (UploadButton's lift, fill, outline, and shadow) both read this, so they
 * start and land together instead of drifting apart. One knob: change it here
 * and both follow. Sibling of `stroke.ts`, same reason -- a value two
 * components must agree on does not belong inside either of them.
 */
export const MOTION_DURATION_MS = 300;
