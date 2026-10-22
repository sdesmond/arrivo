import type postgres from "postgres";
import { encryptField } from "../lib/field-encryption";

// Travel-document columns encrypted at rest. Table and column names are fixed here, never user input,
// so interpolating them into the query text is safe.
const PII_COLUMNS = [
  { table: "users", column: "passport_number" },
  { table: "users", column: "known_traveler_number" },
  { table: "user_companions", column: "passport_number" },
  { table: "user_companions", column: "known_traveler_number" },
] as const;

// Encrypts values written before field encryption existed. Idempotent: already-encrypted values carry the
// enc:v1: prefix and are skipped, so it runs on every container start.
export async function encryptLegacyPii(sql: postgres.Sql, log: (message: string) => void = console.log) {
  let encryptedCount = 0;

  for (const { table, column } of PII_COLUMNS) {
    const rows = await sql.unsafe<{ id: string; value: string }[]>(
      `select id, ${column} as value from ${table} where ${column} is not null and ${column} <> '' and ${column} not like 'enc:v1:%'`
    );
    for (const row of rows) {
      // Matching the old value skips a row the user edited (and the app encrypted) since the select.
      await sql.unsafe(`update ${table} set ${column} = $1 where id = $2 and ${column} = $3`, [
        encryptField(row.value),
        row.id,
        row.value,
      ]);
      encryptedCount += 1;
    }
  }

  if (encryptedCount > 0) log(`Encrypted ${encryptedCount} legacy travel-document value(s).`);
  return encryptedCount;
}
