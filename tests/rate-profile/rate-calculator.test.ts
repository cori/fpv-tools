import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { calculateThrottle } from "../../rate-profile/src/rate-calculator.js";

Deno.test("calculateThrottle - limit type OFF leaves output unchanged", () => {
  const base = calculateThrottle(1.0, 50, 0);
  assertAlmostEquals(calculateThrottle(1.0, 50, 0, "OFF", 60), base, 1e-9);
});

Deno.test("calculateThrottle - SCALE multiplies output by percent", () => {
  const base = calculateThrottle(1.0, 50, 0);
  assertAlmostEquals(
    calculateThrottle(1.0, 50, 0, "SCALE", 80),
    base * 0.8,
    1e-9,
  );
});

Deno.test("calculateThrottle - SCALE at mid stick scales proportionally", () => {
  const base = calculateThrottle(0.5, 50, 0);
  assertAlmostEquals(
    calculateThrottle(0.5, 50, 0, "SCALE", 50),
    base * 0.5,
    1e-9,
  );
});

Deno.test("calculateThrottle - CLIP caps output at percent ceiling", () => {
  assertAlmostEquals(
    calculateThrottle(1.0, 50, 0, "CLIP", 70),
    0.7,
    1e-9,
  );
});

Deno.test("calculateThrottle - CLIP leaves values below ceiling untouched", () => {
  // base at input 0.2 is well below 0.7 ceiling
  const base = calculateThrottle(0.2, 50, 0);
  assertAlmostEquals(
    calculateThrottle(0.2, 50, 0, "CLIP", 70),
    base,
    1e-9,
  );
});

Deno.test("calculateThrottle - 100% limit equals OFF for both modes", () => {
  const base = calculateThrottle(1.0, 50, 0);
  assertEquals(calculateThrottle(1.0, 50, 0, "SCALE", 100), base);
  assertEquals(calculateThrottle(1.0, 50, 0, "CLIP", 100), base);
});

Deno.test("calculateThrottle - unknown limit type behaves as OFF", () => {
  const base = calculateThrottle(0.8, 50, 0);
  assertAlmostEquals(
    calculateThrottle(0.8, 50, 0, "BOGUS", 50),
    base,
    1e-9,
  );
});
