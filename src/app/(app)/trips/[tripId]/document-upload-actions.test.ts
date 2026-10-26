// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertTripAccess,
  adapterDel,
  adapterPut,
  db,
  documentsTable,
  eventsTable,
  getStorageAdapter,
  publishTripEvent,
  recordTripUpdated,
  requireUser,
  revalidatePath,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  adapterDel: vi.fn(),
  adapterPut: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  documentsTable: {},
  eventsTable: { id: "events.id", tripId: "events.tripId" },
  getStorageAdapter: vi.fn(),
  publishTripEvent: vi.fn(),
  recordTripUpdated: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
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

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent,
}));

import { uploadDocument, uploadDocumentToEvent } from "./document-upload-actions";
import { LiveSyncEventType } from "@/data/types";

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
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterPut.mockResolvedValue("https://blob.example.com/doc.pdf");
    db.insert.mockReturnValue({
      values: vi.fn(async () => undefined),
    });
  });

  it("rejects unsupported MIME types before upload or DB work", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("doc.docx", "application/msword"));

    await expect(uploadDocument("trip-1", formData)).rejects.toThrow(
      "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
    );

    expect(adapterPut).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("uploads with a generated storage name and preserves the original filename in the DB row", async () => {
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

    expect(adapterPut).toHaveBeenCalledWith("trip-documents/trip-1/upload-1234.pdf", file);
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      name: "Boarding Pass.pdf",
      kind: "pdf",
      size: "0.1 KB",
      url: "https://blob.example.com/doc.pdf",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.ItineraryChanged,
      tripId: "trip-1",
    });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });
});

describe("uploadDocumentToEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterPut.mockResolvedValue("https://blob.example.com/event-doc.png");
    db.insert.mockReturnValue({
      values: vi.fn(async () => undefined),
    });
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ tripId: "trip-1" }]),
      })),
    });
  });

  it("rejects unsupported MIME types before upload or DB work", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("event.svg", "image/svg+xml"));

    await expect(uploadDocumentToEvent("event-1", formData)).rejects.toThrow(
      "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
    );

    expect(adapterPut).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
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
    expect(adapterPut).toHaveBeenCalledWith("event-documents/event-1/upload-1234.png", file);
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      eventId: "event-1",
      name: "Agenda.png",
      kind: "image",
      size: "0.1 KB",
      url: "https://blob.example.com/event-doc.png",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.ItineraryChanged,
      tripId: "trip-1",
    });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("throws when the owning event cannot be resolved", async () => {
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    });
    const formData = new FormData();
    formData.append("file", makeFile("Agenda.png", "image/png"));

    await expect(uploadDocumentToEvent("missing-event", formData)).rejects.toThrow("Event not found");

    expect(adapterPut).not.toHaveBeenCalled();
    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });
});
