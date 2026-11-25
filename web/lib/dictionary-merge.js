// Read-time merge for the two dictionary layers. Preset rows remain owned by
// the signed OPFS pack; this module never writes them into user_entities.

function normKey(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function aliasesOf(row) {
  const aliases = Array.isArray(row?.aliases) ? row.aliases : [];
  return aliases.map((alias) => String(alias).trim()).filter(Boolean);
}

function addAliases(target, aliases, canonical) {
  const seen = new Set(target.map((alias) => alias.toLowerCase()));
  seen.add(canonical.toLowerCase());
  for (const alias of aliases) {
    const key = alias.toLowerCase();
    if (!seen.has(key)) {
      target.push(alias);
      seen.add(key);
    }
  }
}

/**
 * Merge immutable preset rows with user-owned rows for matching.
 *
 * User ownership wins for canonical/type metadata. Aliases are unioned so a
 * user override does not accidentally drop a preset alias. packVersion is
 * null for user rows and names the signed preset pack for preset rows.
 */
export function mergeDictionaryLayers(userRows = [], presetRows = []) {
  const merged = new Map();

  for (const row of presetRows) {
    const canonical = String(row?.canonical || "").trim();
    const key = normKey(canonical);
    if (!key) continue;
    merged.set(key, {
      ...row,
      canonical,
      type: String(row?.type || "COUNTERPARTY"),
      aliases: aliasesOf(row),
      source: "preset",
      packVersion: row?.packVersion || null,
    });
  }

  for (const row of userRows) {
    const canonical = String(row?.canonical || "").trim();
    const key = normKey(canonical);
    if (!key) continue;
    const prior = merged.get(key);
    const aliases = [];
    if (prior) addAliases(aliases, prior.aliases || [], prior.canonical || canonical);
    addAliases(aliases, aliasesOf(row), canonical);
    merged.set(key, {
      ...(prior || {}),
      ...row,
      canonical,
      type: String(row?.type || prior?.type || "COUNTERPARTY"),
      aliases,
      source: "user",
      packVersion: row?.packVersion || null,
    });
  }

  return Array.from(merged.values());
}
