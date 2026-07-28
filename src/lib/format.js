// ── Address labels ────────────────────────────────────────────────────────
// profiles stores building/floor as codes; these map them to display labels.
export const BUILDING_LABELS = {
  '1240_arthur': '1240 W Arthur Ave',
  '1243_arthur': '1243 W Arthur Ave',
  '6419_wayne': '6419 N Wayne Ave',
}

export const FLOOR_LABELS = {
  garden: 'Garden Floor',
  first: 'First Floor',
  second: 'Second Floor',
}

// ['1243 W Arthur Ave', 'Garden Floor', 'Room A'] — missing parts are dropped
// rather than rendering an empty segment or a raw code.
export function addressParts(profile) {
  if (!profile) return []
  const parts = []
  const building = BUILDING_LABELS[profile.building]
  const floor = FLOOR_LABELS[profile.floor]
  if (building) parts.push(building)
  if (floor) parts.push(floor)
  if (profile.room_label) parts.push(`Room ${profile.room_label}`)
  return parts
}

export function formatAddress(profile, sep = ' · ') {
  return addressParts(profile).join(sep)
}
