// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, documentsTable, eventsTable, put, requireUser, revalidatePath, saveLocalUpload } =
  vi.hoisted(() => ({
    assertTripAccess: vi.fn(),
    db: {
      insert: vi.fn(),
      select: vi.fn(),
    },
    documentsTable: {},
    eventsTable: { id: "events.id", tripId: "events.tripId" },
    put: vi.fn(),
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    saveLocalUpload: vi.fn(),
  }));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  documents: documentsTable,
  events: eventsTable,
}));

vi.mock("@vercel/blob", () => ({
  put,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/local-upload", () => ({
  saveLocalUpload,
}));

import { uploadDocument, uploadDocumentToEvent } from "./document-upload-actions";

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("uploadDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    put.mockResolvedValue({ url: "https://blob.example.com/doc.pdf" });
    saveLocalUpload.mockResolvedValue("/uploads/trip-documents/trip-1/upload-1234.pdf");
    db.insert.mockReturnValue({
      values: vi.fn(async () => undefined),
    });
  });

  it("rejects unsupported MIME types before Blob or DB work", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("doc.docx", "application/msword"));

    await expect(uploadDocument("trip-1", formData)).rejects.toThrow(
      "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
    );

    expect(put).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("uploads with a generated Blob storage name and preserves the original filename in the DB row", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedValues = values;
      }),
    });
    const file = makeFile("Boarding Pass.pdf", "application/pdf");
    const formData = new FormData();
    formData.append("file", file);

    await uploadDocument("trip-1", formData);

    expect(put).toHaveBeenCalledWith("trip-documents/trip-1/upload-1234.pdf", file, { access: "public" });
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      name: "Boarding Pass.pdf",
      kind: "pdf",
      size: "0.1 KB",
      url: "https://blob.example.com/doc.pdf",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("uses the generated storage name for local stub uploads too", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    vi.stubEnv("UPLOAD_STUB", "true");
    const file = makeFile("Boarding Pass.pdf", "application/pdf");
    const formData = new FormData();
    formData.append("file", file);

    await uploadDocument("trip-1", formData);

    expect(saveLocalUpload).toHaveBeenCalledWith(file, { storageName: "trip-documents/trip-1/upload-1234.pdf" });
    expect(put).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("uploadDocumentToEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    put.mockResolvedValue({ url: "https://blob.example.com/event-doc.png" });
    saveLocalUpload.mockResolvedValue("/uploads/event-documents/event-1/upload-1234.png");
    db.insert.mockReturnValue({
      values: vi.fn(async () => undefined),
    });
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ tripId: "trip-1" }]),
      })),
    });
  });

  it("rejects unsupported MIME types before Blob or DB work", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("event.svg", "image/svg+xml"));

    await expect(uploadDocumentToEvent("event-1", formData)).rejects.toThrow(
      "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
    );

    expect(put).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("uploads event documents with an event-scoped generated storage name", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedValues = values;
      }),
    });
    const file = makeFile("Agenda.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);

    await uploadDocumentToEvent("event-1", formData);

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(put).toHaveBeenCalledWith("event-documents/event-1/upload-1234.png", file, { access: "public" });
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      eventId: "event-1",
      name: "Agenda.png",
      kind: "image",
      size: "0.1 KB",
      url: "https://blob.example.com/event-doc.png",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});
