import { FIELD_LIMITS, overLimitMessage } from "@/lib/validation-limits";

export function normalizeTemplateName(name: string | undefined): string {
  const normalizedName = (name ?? "").trim();

  if (!normalizedName) {
    throw new Error("Template name is required.");
  }

  if (normalizedName.length > FIELD_LIMITS.templateName) {
    throw new Error(overLimitMessage("Template name", FIELD_LIMITS.templateName));
  }

  return normalizedName;
}
