// Deliberately bad fixture: the BetterOffice direct-serialise escape hatch.
export function exportDoc(doc) {
  const bytes = doc.toBytes();
  return bytes;
}
