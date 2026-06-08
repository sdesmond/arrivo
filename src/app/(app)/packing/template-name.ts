export function normalizeTemplateName(name: string | undefined): string {
  const normalizedName = (name ?? "").trim();

  if (!normalizedName) {
    throw new Error("Template name is required.");
  }

  if (normalizedName.length > 30) {
    throw new Error("Template name must be 30 characters or fewer.");
  }

  return normalizedName;
}
