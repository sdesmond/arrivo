import { cookies } from "next/headers";

export async function getServerNow(): Promise<Date> {
  if (process.env.NODE_ENV !== "production") {
    const iso = (await cookies()).get("__mock_date__")?.value;
    if (iso) return new Date(iso);
  }
  return new Date();
}
