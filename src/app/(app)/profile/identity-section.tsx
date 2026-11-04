"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import type { ChangeEvent } from "react";
import { Section, Field } from "@/components/arrivo/form-section";
import { ProfileAvatar } from "@/components/arrivo/profile-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import { removeAvatar, uploadAvatar } from "./avatar-actions";
import type { UserProfile } from "@/data/types";
import { normalizeUsername, validateUsername } from "@/lib/username";
import {
  assertValidAvatarUpload,
  AVATAR_UPLOAD_ACCEPT,
  AVATAR_UPLOAD_HINT,
  AVATAR_UPLOAD_REJECTED_MESSAGE,
} from "@/lib/upload-policy";

// Diameter of the profile photo, in px.
const PHOTO_SIZE = 144;

interface ProfileIdentitySectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

function getInitials(user: UserProfile): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return user.username[0].toUpperCase();
}

export function ProfileIdentitySection({ user, onDirtyChange }: ProfileIdentitySectionProps) {
  const [name, setName] = useState(user.name ?? "");
  const [username, setUsername] = useState(user.username);
  const [isPending, startTransition] = useTransition();
  const [image, setImage] = useState<string | null>(user.image ?? null);
  const [photoOperation, setPhotoOperation] = useState<"upload" | "remove" | null>(null);
  const [isPhotoPending, startPhotoTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const initials = getInitials({ ...user, name: name || null });

  const isNameDirty = name !== (user.name ?? "");
  const isUsernameDirty = normalizeUsername(username) !== user.username;

  function handleNameChange(next: string) {
    if (next === name) return;
    setName(next);
    onDirtyChange?.(next !== (user.name ?? "") || isUsernameDirty);
  }

  function handleUsernameChange(next: string) {
    if (next === username) return;
    setUsername(next);
    onDirtyChange?.(isNameDirty || normalizeUsername(next) !== user.username);
  }

  const nameError = name.length > 100 ? "Name must be 100 characters or fewer." : null;
  const usernameError = validateUsername(username);

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfile({ name, ...(isUsernameDirty ? { username } : {}) });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDirtyChange?.(false);
    });
  }

  const isDirty = isNameDirty || isUsernameDirty;

  function handleChoosePhoto() {
    if (isPhotoPending) return;
    fileInputRef.current?.click();
  }

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    input.value = "";
    if (!file || isPhotoPending) return;

    try {
      assertValidAvatarUpload(file);
    } catch {
      toast.error(AVATAR_UPLOAD_REJECTED_MESSAGE);
      return;
    }

    setPhotoOperation("upload");
    startPhotoTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadAvatar(formData);
        if (result.ok) {
          setImage(result.image);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Couldn't update your photo. Try again.");
      } finally {
        setPhotoOperation(null);
      }
    });
  }

  function handleRemovePhoto() {
    if (isPhotoPending) return;
    setPhotoOperation("remove");
    startPhotoTransition(async () => {
      try {
        const result = await removeAvatar();
        if (result.ok) {
          setImage(result.image);
          // The Remove button is about to unmount; keep keyboard focus inside the section.
          uploadButtonRef.current?.focus();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Couldn't remove your photo. Try again.");
      } finally {
        setPhotoOperation(null);
      }
    });
  }

  return (
    <Section>
      <div className="flex flex-col items-center gap-2 mb-1" style={{ width: PHOTO_SIZE }}>
        <div className="relative shrink-0" style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}>
          <ProfileAvatar
            image={image}
            initials={initials}
            size={PHOTO_SIZE}
            tint={{ bg: "var(--surface-2)", color: "var(--fg)" }}
            fontSize="calc(52px * var(--font-scale))"
          />
          <button
            ref={uploadButtonRef}
            type="button"
            // aria-disabled, not disabled, so keyboard focus stays on the control while a photo is uploading.
            aria-disabled={isPhotoPending || undefined}
            aria-describedby="profile-photo-hint"
            onClick={handleChoosePhoto}
            className="peer absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full opacity-0 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-100"
            style={{
              background: "color-mix(in oklab, var(--fg) 55%, transparent)",
              color: "var(--bg)",
              fontFamily: "var(--font-body, ui-sans-serif)",
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: 500,
            }}
          >
            <Camera size={26} strokeWidth={1.5} aria-hidden="true" />
            {photoOperation === "upload" ? "Uploading…" : image ? "Replace photo" : "Upload photo"}
          </button>
          {/* Resting affordance for touch and keyboard-free use; the hover overlay replaces it. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute flex items-center justify-center rounded-full transition-opacity peer-hover:opacity-0 peer-focus-visible:opacity-0 peer-aria-disabled:opacity-0"
            style={{
              right: 4,
              bottom: 4,
              width: 34,
              height: 34,
              background: "var(--surface)",
              color: "var(--fg-2)",
              border: "1px solid var(--line)",
            }}
          >
            <Camera size={18} strokeWidth={1.5} />
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-center">
          {image ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11"
              disabled={isPhotoPending}
              focusableWhenDisabled
              onClick={handleRemovePhoto}
            >
              {photoOperation === "remove" ? "Removing…" : "Remove photo"}
            </Button>
          ) : null}
          <div
            className="whitespace-nowrap"
            id="profile-photo-hint"
            style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)", lineHeight: 1.4 }}
          >
            {AVATAR_UPLOAD_HINT}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handlePhotoSelected}
          />
        </div>
      </div>

      <Field label="Name" htmlFor="profile-name" error={nameError ?? undefined}>
        <Input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Your name"
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? "profile-name-error" : undefined}
        />
      </Field>

      <Field label="Username" htmlFor="profile-username" error={usernameError ?? undefined}>
        <Input
          id="profile-username"
          type="text"
          value={username}
          onChange={(event) => handleUsernameChange(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!usernameError || undefined}
          aria-describedby={usernameError ? "profile-username-error" : undefined}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty || !!nameError || !!usernameError}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
