export function normalizeTemplateName(name: string | undefined): string {
  const normalizedName = (name ?? "").trim();

  if (!normalizedName) {
    throw new Error("Template name is required.");
  }

  if (normalizedName.length > 100) {
    throw new Error("Template name must be 100 characters or fewer.");
  }

  return normalizedName;
}
