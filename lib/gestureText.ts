// What each gesture shows on the kiosk, per part of the model. Written on the business side's Interactions screen
// (Gesture → Does → What it says) and published with the demo.
//
//   Whole product: Hover (hold) → pauses the spin, shows `whole`.
//   A part:        Hover (hold) → pulls the part out, shows `hover` (a short label).
//                  Pinch        → zooms in, shows `pinch` (one or two sentences) and `specs` (optional).
//                  Open palm    → resets the demo (always on, nothing to write).

export type PartText = { hover: string; pinch: string; specs: string };
export type GestureText = { whole: string; parts: Record<string, PartText> };

export const EMPTY_PART_TEXT: PartText = { hover: "", pinch: "", specs: "" };

/** The built-in Orbit Earbuds example (dummy values), shown only when nothing has been published. Keys are part ids. */
export const SAMPLE_GESTURE_TEXT: GestureText = {
  whole: "Wireless earbuds that tune out the room.",
  parts: {
    shell: { hover: "Holds it all together", pinch: "Shaped to sit flush in the ear, with touch controls on the stem.", specs: "Recycled polycarbonate · Touch controls" },
    tip: { hover: "Seals the sound in", pinch: "Soft silicone in three sizes creates the seal noise cancelling needs.", specs: "Sizes S · M · L" },
    driver: { hover: "Makes the sound", pinch: "An 11 mm driver tuned for clear voices and full bass.", specs: "11 mm · Dynamic" },
    battery: { hover: "Lasts all day", pinch: "8 hours per charge, and the case adds 20 more.", specs: "8 h · 28 h with case" },
    board: { hover: "Cancels the noise", pinch: "Listens to the room and plays back the opposite sound.", specs: "Orbit A1 chip · Adaptive" },
    mic: { hover: "Picks out your voice", pinch: "Three microphones focus on your voice and filter out wind.", specs: "3 mics per bud" },
  },
};

/** Sample part ids → names shown on the kiosk. */
export const SAMPLE_PART_NAMES: Record<string, string> = {
  shell: "Shell", tip: "Ear tip", driver: "Driver", battery: "Battery", board: "Chip board", mic: "Mic array",
};
