// Every pedal, side by side: what each one IS, and the math it runs. A pedal is
// an instance of Pedal — overdrive and slapback are peers here, whatever family
// they come from. One file per family (base.js, clipping.js, delay.js,
// modulation.js); this module just aggregates the catalog and re-exports the
// public surface.
export { Pedal } from "./base.js";
export { CLIPPING, ClippingPedal } from "./clipping.js";
export {
  DELAYS,
  DelayPedal,
  echo,
  impulseResponse,
  NLONG,
  pluck,
  SPANMS,
} from "./delay.js";
export {
  ModulationPedal,
  MODULATIONS,
  NMOD,
  sineShape,
  SPANMS_MOD,
  squareShape,
  triangleShape,
} from "./modulation.js";

import { CLIPPING } from "./clipping.js";
import { DELAYS } from "./delay.js";
import { MODULATIONS } from "./modulation.js";

// every pedal, by id — the whole catalog, regardless of family
export const PEDALS = Object.fromEntries(
  [...CLIPPING, ...DELAYS, ...MODULATIONS].map((p) => [p.id, p]),
);
