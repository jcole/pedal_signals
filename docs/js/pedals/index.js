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
export {
  CHORUSES,
  combResponseDb,
  DELAY_FLOOR_MS,
  ModulatedDelayPedal,
  NCHORUS,
  SPANMS_CHORUS,
  sweptComb,
} from "./modulatedDelay.js";

import { CLIPPING } from "./clipping.js";
import { DELAYS } from "./delay.js";
import { CHORUSES } from "./modulatedDelay.js";
import { MODULATIONS } from "./modulation.js";

// every pedal, by id
export const PEDALS = Object.fromEntries(
  [...CLIPPING, ...DELAYS, ...MODULATIONS, ...CHORUSES].map((p) => [p.id, p]),
);
