/**
 * Parse a Betaflight CLI dump (diff all / dump all) into labelled sections.
 *
 * Sections are delimited by:
 *   - Lines matching "# word" (e.g. "# feature", "# master")
 *   - "profile N" and "rateprofile N" lines
 *   - "batch start" / "batch end" / "save" (structural)
 *
 * @param {string} text
 * @returns {Array<{id: string, title: string, lines: string[]}>}
 */
export function parseCLI(text) {
  const lines = text.split("\n").map((l) => l.trimEnd());
  /** @type {Array<{id: string, title: string, lines: string[]}>} */
  const sections = [];
  let current = /** @type {{id: string, title: string, lines: string[]}|null} */ (null);
  let pastBatchStart = false;

  function flush() {
    if (!current) return;
    while (current.lines.length && !current.lines[current.lines.length - 1].trim()) {
      current.lines.pop();
    }
    sections.push(current);
    current = null;
  }

  function open(id, title) {
    flush();
    current = { id, title, lines: [] };
  }

  open("header", "Header");

  for (const line of lines) {
    const t = line.trim();

    // Skip leading blank lines before batch start
    if (!pastBatchStart && !t) continue;

    if (t === "batch start") {
      pastBatchStart = true;
      if (current) current.lines.push(line);
      continue;
    }

    if (!pastBatchStart) {
      if (current) current.lines.push(line);
      continue;
    }

    // profile N — starts a new profile section (unless already in footer)
    const profileMatch = /^profile\s+(\d+)$/.exec(t);
    if (profileMatch) {
      if (current?.id === "footer") {
        current.lines.push(line);
      } else {
        const n = profileMatch[1];
        open(`profile_${n}`, `Profile ${n}`);
        current.lines.push(line);
      }
      continue;
    }

    // rateprofile N — starts a new rateprofile section (unless already in footer)
    const rateMatch = /^rateprofile\s+(\d+)$/.exec(t);
    if (rateMatch) {
      if (current?.id === "footer") {
        current.lines.push(line);
      } else {
        const n = rateMatch[1];
        open(`rateprofile_${n}`, `Rate Profile ${n}`);
        current.lines.push(line);
      }
      continue;
    }

    // batch end / save — everything from here is footer
    if (t === "batch end" || t === "save") {
      if (current?.id !== "footer") open("footer", "Footer");
      current.lines.push(line);
      continue;
    }

    // Section header comment: "# word [word...]" with only safe chars
    // Excludes firmware version lines which contain "/" ":" etc.
    const commentMatch = /^#\s+([a-zA-Z][a-zA-Z0-9_ ]{0,60})$/.exec(t);
    if (commentMatch) {
      const name = commentMatch[1].trim();
      const nameLower = name.toLowerCase();

      // "# profile" / "# rateprofile" are sub-headers, never section openers.
      // In diff-all format they appear after the profile N command (already inside
      // the section). In dump-all format they appear before it as structural markers
      // — discard those so no spurious section is created.
      if (nameLower === "profile" || nameLower === "rateprofile") {
        if (
          current &&
          ((current.id.startsWith("profile_") && nameLower === "profile") ||
            (current.id.startsWith("rateprofile_") && nameLower === "rateprofile"))
        ) {
          current.lines.push(line);
        }
        continue;
      }

      // "# restore ..." / "# save configuration" -> footer
      if (nameLower.startsWith("restore") || nameLower.startsWith("save config")) {
        if (current?.id !== "footer") open("footer", "Footer");
        current.lines.push(line);
        continue;
      }

      open(nameLower, name);
      continue;
    }

    if (current) current.lines.push(line);
  }

  flush();
  return sections.filter((s) => s.lines.some((l) => l.trim()));
}

/**
 * Compare two parsed CLI section arrays into a unified diff structure.
 *
 * @param {Array<{id: string, title: string, lines: string[]}>} sectionsA
 * @param {Array<{id: string, title: string, lines: string[]}>} sectionsB
 * @returns {Array<{id: string, title: string, linesA: string[], linesB: string[], status: 'same'|'diff'|'only-a'|'only-b'}>}
 */
export function compareSections(sectionsA, sectionsB) {
  const mapA = new Map(sectionsA.map((s) => [s.id, s]));
  const mapB = new Map(sectionsB.map((s) => [s.id, s]));

  const allIds = [];
  const seen = new Set();

  for (const s of sectionsA) {
    if (!seen.has(s.id)) {
      allIds.push(s.id);
      seen.add(s.id);
    }
  }
  for (const s of sectionsB) {
    if (!seen.has(s.id)) {
      allIds.push(s.id);
      seen.add(s.id);
    }
  }

  return allIds.map((id) => {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const source = a ?? b;
    const linesA = a?.lines ?? [];
    const linesB = b?.lines ?? [];

    let status;
    if (!a) status = "only-b";
    else if (!b) status = "only-a";
    else if (linesA.join("\n") === linesB.join("\n")) status = "same";
    else status = "diff";

    return { id, title: source.title, linesA, linesB, status };
  });
}
