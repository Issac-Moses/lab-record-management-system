export function repairLeadingTitle(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const repairs: Array<[string, string]> = [
    ["evelop ", "Develop "],
    ["tudy ", "Study "],
    ["esign ", "Design "],
    ["reate ", "Create "],
    ["mplement ", "Implement "],
    ["onnect ", "Connect "],
    ["onfigure ", "Configure "],
    ["uild ", "Build "],
  ];

  for (const [broken, fixed] of repairs) {
    if (raw.toLowerCase().startsWith(broken)) {
      return fixed + raw.slice(broken.length);
    }
  }

  if (/^ini\s+projects/i.test(raw)) {
    return raw.replace(/^ini/i, "Mini");
  }

  if (/^[a-z]/.test(raw)) {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return raw;
}
