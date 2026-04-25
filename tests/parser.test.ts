import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { compareSections, parseCLI } from "../src/parser.js";

const MINIMAL_CLI =
  `# Betaflight / STM32F745 (S745) 4.4.0 Nov  1 2022 / 01:00:00 (abc) MSP API: 1.45
# start the command batch
batch start

# feature
feature TELEMETRY

# serial
serial 0 64 115200 57600 0 115200

# master
set gyro_lpf1_static_hz = 0
set gyro_lpf2_static_hz = 500

profile 0

# profile
set dterm_lpf1_dyn_min_hz = 75

rateprofile 0

# rateprofile
set roll_rc_rate = 100

# restore original profile selection
profile 0

# restore original rateprofile selection
rateprofile 0

# save configuration
save`;

Deno.test("parseCLI - returns non-empty array", () => {
  const sections = parseCLI(MINIMAL_CLI);
  assertEquals(Array.isArray(sections), true);
  assertEquals(sections.length > 0, true);
});

Deno.test("parseCLI - extracts header with Betaflight line and batch start", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const header = sections.find((s) => s.id === "header");
  assertExists(header);
  assertEquals(header.lines.some((l) => l.includes("Betaflight")), true);
  assertEquals(header.lines.some((l) => l.trim() === "batch start"), true);
});

Deno.test("parseCLI - extracts feature section", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const feature = sections.find((s) => s.id === "feature");
  assertExists(feature);
  assertEquals(feature.lines.some((l) => l.includes("feature TELEMETRY")), true);
});

Deno.test("parseCLI - feature section does not contain the comment line", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const feature = sections.find((s) => s.id === "feature");
  assertExists(feature);
  assertEquals(feature.lines.every((l) => l.trim() !== "# feature"), true);
});

Deno.test("parseCLI - extracts serial section", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const serial = sections.find((s) => s.id === "serial");
  assertExists(serial);
  assertEquals(serial.lines.some((l) => l.startsWith("serial")), true);
});

Deno.test("parseCLI - extracts master section with set commands", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const master = sections.find((s) => s.id === "master");
  assertExists(master);
  assertEquals(master.lines.some((l) => l.includes("set gyro_lpf1_static_hz")), true);
  assertEquals(master.lines.some((l) => l.includes("set gyro_lpf2_static_hz")), true);
});

Deno.test("parseCLI - extracts profile_0 section", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const profile0 = sections.find((s) => s.id === "profile_0");
  assertExists(profile0);
  assertEquals(profile0.lines.some((l) => l.trim() === "profile 0"), true);
  assertEquals(profile0.lines.some((l) => l.includes("set dterm_lpf1_dyn_min_hz")), true);
});

Deno.test("parseCLI - profile_0 includes the sub-header comment", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const profile0 = sections.find((s) => s.id === "profile_0");
  assertExists(profile0);
  assertEquals(profile0.lines.some((l) => l.trim() === "# profile"), true);
});

Deno.test("parseCLI - extracts rateprofile_0 section", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const rp0 = sections.find((s) => s.id === "rateprofile_0");
  assertExists(rp0);
  assertEquals(rp0.lines.some((l) => l.trim() === "rateprofile 0"), true);
  assertEquals(rp0.lines.some((l) => l.includes("set roll_rc_rate")), true);
});

Deno.test("parseCLI - restore lines and save go to footer", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const footer = sections.find((s) => s.id === "footer");
  assertExists(footer);
  assertEquals(footer.lines.some((l) => l.trim() === "save"), true);
  assertEquals(footer.lines.some((l) => l.includes("restore")), true);
});

Deno.test("parseCLI - no section has empty lines array", () => {
  const sections = parseCLI(MINIMAL_CLI);
  for (const sec of sections) {
    assertEquals(
      sec.lines.some((l) => l.trim()),
      true,
      `section ${sec.id} has no non-empty lines`,
    );
  }
});

// compareSections

Deno.test("compareSections - identical input yields all 'same'", () => {
  const sections = parseCLI(MINIMAL_CLI);
  const compared = compareSections(sections, sections);
  for (const sec of compared) {
    assertEquals(sec.status, "same", `expected same for ${sec.id}`);
  }
});

Deno.test("compareSections - section only in A is 'only-a'", () => {
  const a = [{ id: "feature", title: "feature", lines: ["feature TELEMETRY"] }];
  const b: never[] = [];
  const compared = compareSections(a, b);
  assertEquals(compared[0].status, "only-a");
  assertEquals(compared[0].linesA, ["feature TELEMETRY"]);
  assertEquals(compared[0].linesB, []);
});

Deno.test("compareSections - section only in B is 'only-b'", () => {
  const a: never[] = [];
  const b = [{ id: "beacon", title: "beacon", lines: ["beacon RX_LOST"] }];
  const compared = compareSections(a, b);
  assertEquals(compared[0].status, "only-b");
  assertEquals(compared[0].linesA, []);
  assertEquals(compared[0].linesB, ["beacon RX_LOST"]);
});

Deno.test("compareSections - different content is 'diff'", () => {
  const a = [{ id: "master", title: "master", lines: ["set gyro_lpf1_static_hz = 0"] }];
  const b = [{ id: "master", title: "master", lines: ["set gyro_lpf1_static_hz = 100"] }];
  const compared = compareSections(a, b);
  assertEquals(compared[0].status, "diff");
  assertEquals(compared[0].linesA, ["set gyro_lpf1_static_hz = 0"]);
  assertEquals(compared[0].linesB, ["set gyro_lpf1_static_hz = 100"]);
});

Deno.test("compareSections - order: A sections first, then B-only sections", () => {
  const a = [
    { id: "feature", title: "feature", lines: ["feature A"] },
    { id: "serial", title: "serial", lines: ["serial 0"] },
  ];
  const b = [
    { id: "feature", title: "feature", lines: ["feature A"] },
    { id: "beacon", title: "beacon", lines: ["beacon RX_LOST"] },
  ];
  const compared = compareSections(a, b);
  assertEquals(compared[0].id, "feature");
  assertEquals(compared[1].id, "serial");
  assertEquals(compared[2].id, "beacon");
});

Deno.test("compareSections - exposes both linesA and linesB for diff sections", () => {
  const a = [{ id: "feature", title: "feature", lines: ["feature TELEMETRY"] }];
  const b = [{ id: "feature", title: "feature", lines: ["feature RX_PPM"] }];
  const compared = compareSections(a, b);
  assertEquals(compared[0].linesA, ["feature TELEMETRY"]);
  assertEquals(compared[0].linesB, ["feature RX_PPM"]);
});
