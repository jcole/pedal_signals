// Aggregates the catalog (one file per family) and re-exports the public surface.
export { Pedal } from "./base.js";
export { CLIPPING, ClippingPedal } from "./clipping.js";
export {
  burst,
  DELAYS,
  DelayPedal,
  echo,
  guitarBurst,
  impulseResponse,
  NLONG,
  PLUCK_MS,
  pluck,
  SPANMS,
  TAP_FLOOR,
} from "./delay.js";
export {
  MODULATIONS,
  ModulationPedal,
  NMOD,
  SPANMS_MOD,
  sineShape,
  squareShape,
  triangleShape,
} from "./modulation.js";

import { CLIPPING } from "./clipping.js";
import { DELAYS } from "./delay.js";
import { MODULATIONS } from "./modulation.js";

// every pedal, by id
export const PEDALS = Object.fromEntries(
  [...CLIPPING, ...DELAYS, ...MODULATIONS].map((p) => [p.id, p]),
);
