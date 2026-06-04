# Blind Hunter — Adversarial Code Review

You receive ONLY the diff below. No project context, no spec, no commit history.

## Instructions

Review this diff adversarially. Assume nothing. Question everything. Look for:
- Logic errors and correctness bugs
- Inconsistent naming or conventions within the diff itself
- Dead code, unreachable branches, missing error handling
- Race conditions, missing guards, async pitfalls
- Security issues (injection, auth bypass, data leaks)
- Performance problems (N+1 queries, redundant work, sync in hot paths)

Output findings as a Markdown list. Each finding: one-line title, severity (BLOCKING / MAJOR / MINOR), and evidence from the diff (line-level references using file paths from the diff headers).

## Diff

```
diff --git a/_bmad-output/implementation-artifacts/3-6-ux-cosmetic-polish.md b/_bmad-output/implementation-artifacts/3-6-ux-cosmetic-polish.md
new file mode 100644
index 0000000..61cdff4
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/3-6-ux-cosmetic-polish.md
@@ -0,0 +1,228 @@
+# Story 3.6: UX/Cosmetic Polish
+
+Status: done
+
+## Story
+
+As a user,
+I want consistent and polished packing UI behavior,
+So that section labels behave correctly, template names are distinguishable, and sort order is case-insensitive.
+
+## Acceptance Criteria
+
+### AC #1 — Section labels are non-draggable with no snap-back
+
+**Given** a section label in the packing list
+**When** the user attempts to drag it
+**Then** the label does not move at all (non-draggable, no snap-back)
+
+### AC #2 — Distinct aria-labels for duplicate template names
+
+**Given** two or more templates share the same name
+**When** they render in the library
+**Then** their `aria-label` attributes are distinct (e.g., include the template `id`)
+
+### AC #3 — Case-insensitive template name sort
+
+**Given** a list of templates sorted by name
+**Then** the sort is case-insensitive
+**And** "beach trip" and "Beach Trip" appear adjacent rather than separated by case

diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
index 0579395..5090d77 100644
--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
+++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
@@ -35,7 +35,7 @@
 # - Dev moves story to 'review', then runs code-review (fresh context, different LLM recommended)
 
 generated: 2026-05-31
-last_updated: 2026-06-03 # story 3.5 done
+last_updated: 2026-06-04 # story 3.6 reviewed and fixed
 project: Packt
 project_key: NOKEY
 tracking_system: file-system
@@ -62,4 +62,4 @@ development_status:
   3-3-optimistic-update-reliability: done
   3-4-database-schema-housekeeping: done
   3-5-test-quality-improvements: done
-  3-6-ux-cosmetic-polish: backlog
+  3-6-ux-cosmetic-polish: done

diff --git a/src/components/packt/droppable-packing-section.test.tsx b/src/components/packt/droppable-packing-section.test.tsx
index f7e3d30..29bf09c 100644
--- a/src/components/packt/droppable-packing-section.test.tsx
+++ b/src/components/packt/droppable-packing-section.test.tsx
@@ -17,13 +17,15 @@ vi.mock("@dnd-kit/sortable", () => ({
 describe("DroppablePackingSection", () => {
   it("registers a droppable for its container id and renders children", () => {
     render(
-      <DroppablePackingSection containerId="container:label-1" sortableIds={["label-1", "item-1"]}>
+      <DroppablePackingSection containerId="container:label-1" sortableIds={["item-1"]} header={<h2>Documents</h2>}>
         <p>Section content</p>
       </DroppablePackingSection>
     );
 
     expect(useDroppableMock).toHaveBeenCalledWith({ id: "container:label-1" });
+    expect(screen.getByText("Documents")).toBeInTheDocument();
     expect(screen.getByText("Section content")).toBeInTheDocument();
+    expect(screen.getByText("Documents").closest("[data-packing-dropzone]")).toBeNull();
   });
 
   it("renders an empty container so it can still accept drops", () => {

diff --git a/src/components/packt/droppable-packing-section.tsx b/src/components/packt/droppable-packing-section.tsx
index 77ef700..005f92c 100644
--- a/src/components/packt/droppable-packing-section.tsx
+++ b/src/components/packt/droppable-packing-section.tsx
@@ -9,6 +9,7 @@ export interface DroppablePackingSectionProps {
   containerId: string;
   /** Sortable item ids registered in this container's SortableContext. */
   sortableIds: string[];
+  header?: ReactNode;
   children: ReactNode;
 }
 
@@ -21,15 +22,19 @@ export interface DroppablePackingSectionProps {
 export function DroppablePackingSection({
   containerId,
   sortableIds,
+  header,
   children,
 }: DroppablePackingSectionProps): ReactElement {
   const { setNodeRef } = useDroppable({ id: containerId });
 
   return (
-    <div ref={setNodeRef} data-packing-container={containerId} className="flex flex-col gap-2">
-      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
-        {children}
-      </SortableContext>
+    <div data-packing-container={containerId} className="flex flex-col gap-2">
+      {header}
+      <div ref={setNodeRef} data-packing-dropzone={containerId} className="flex flex-col gap-2">
+        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
+          {children}
+        </SortableContext>
+      </div>
     </div>
   );
 }

diff --git a/src/components/packt/packing-list-sortable.test.tsx b/src/components/packt/packing-list-sortable.test.tsx
index 1b8227f..f6bf8c8 100644
--- a/src/components/packt/packing-list-sortable.test.tsx
+++ b/src/components/packt/packing-list-sortable.test.tsx
@@ -644,6 +644,56 @@ describe("PackingListSortable", () => {
     expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
     expect(screen.getByTitle("Reorder Item A")).toBeInTheDocument();
     expect(screen.getByTitle("Reorder Item B")).toBeInTheDocument();
+
+    // Labels must render as plain PackingRow (not SortablePackingRow) — the
+    // label row must sit outside the droppable/sortable region entirely.
+    const labelRow = document.querySelector('[data-packing-kind="label"]');
+    expect(labelRow?.parentElement).toHaveAttribute("data-packing-container");
+    expect(labelRow?.closest("[data-packing-dropzone]")).toBeNull();
+  });
+
+  it("keeps the section header outside the drop zone so header drops cannot reparent items", () => {
+    render(
+      <PackingListSortable
+        items={reorderItems}
+        pendingItemIds={new Set()}
+        onRemoveItem={vi.fn()}
+        onToggleItem={vi.fn(async () => undefined)}
+        onOptimisticReorder={vi.fn()}
+        onReorderItems={vi.fn()}
+      />
+    );
+
+    const labelRow = document.querySelector('[data-packing-kind="label"]');
+    const dropZone = document.querySelector('[data-packing-dropzone="container:label-1"]');
+    expect(dropZone).not.toBeNull();
+    expect(dropZone?.contains(labelRow)).toBe(false);
+  });
+
+  it("never announces label reordering during normal item moves", () => {
+    const onAnnounceMove = vi.fn();
+
+    render(
+      <PackingListSortable
+        items={reorderItems}
+        pendingItemIds={new Set()}
+        onRemoveItem={vi.fn()}
+        onToggleItem={vi.fn(async () => undefined)}
+        onOptimisticReorder={vi.fn()}
+        onReorderItems={vi.fn()}
+        onAnnounceMove={onAnnounceMove}
+      />
+    );
+
+    act(() => {
+      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
+        active: { id: "item-c" },
+        over: { id: "item-a" },
+      });
+    });
+
+    expect(onAnnounceMove).toHaveBeenCalledWith("Moved Item C to Documents.");
+    expect(onAnnounceMove).not.toHaveBeenCalledWith("Labels cannot be reordered.");
   });
 
   it("edits a section label, removes and toggles a section item", async () => {

diff --git a/src/components/packt/packing-list-sortable.tsx b/src/components/packt/packing-list-sortable.tsx
index 1f85dd1..8b5b3d9 100644
--- a/src/components/packt/packing-list-sortable.tsx
+++ b/src/components/packt/packing-list-sortable.tsx
@@ -169,18 +169,19 @@ export function PackingListSortable({
           <DroppablePackingSection
             key={section.label.id}
             containerId={containerDomId(section.label.id!)}
-            sortableIds={[section.label.id!, ...section.items.map((item) => item.id!)]}
+            sortableIds={section.items.map((item) => item.id!)}
+            header={
+              <PackingRow
+                item={section.label}
+                isLabel
+                isComplete={completeLabelIds.has(section.label.id!)}
+                onRemove={() => onRemoveItem(section.label)}
+                onEdit={
+                  section.label.id && onEditItem ? (name) => onEditItem(section.label.id as string, name) : undefined
+                }
+              />
+            }
           >
-            <SortablePackingRow
-              id={section.label.id!}
-              item={section.label}
-              isLabel
-              isComplete={completeLabelIds.has(section.label.id!)}
-              onRemove={() => onRemoveItem(section.label)}
-              onEdit={
-                section.label.id && onEditItem ? (name) => onEditItem(section.label.id as string, name) : undefined
-              }
-            />
             {section.items.length > 0 ? (
               <div className="ml-3 flex flex-col gap-2 border-l pl-3" style={{ borderColor: "var(--line)" }}>
                 {section.items.map((item) => (

diff --git a/src/components/packt/packing-list-view.test.tsx b/src/components/packt/packing-list-view.test.tsx
index e237ff1..fa73c98 100644
--- a/src/components/packt/packing-list-view.test.tsx
+++ b/src/components/packt/packing-list-view.test.tsx
@@ -465,7 +465,7 @@ describe("PackingListView", () => {
     expectMinimumTouchTarget(dragHandle);
   });
 
-  it("calls useSortable with disabled:true for section labels", () => {
+  it("does not call useSortable for section labels (labels render as plain PackingRow)", () => {
     render(
       <PackingListView
         tripId="trip-1"
@@ -483,7 +483,9 @@ describe("PackingListView", () => {
       const options = call[0] as { disabled?: boolean } | undefined;
       return options?.disabled === true;
     });
-    expect(labelCalls.length).toBeGreaterThan(0);
+    // Labels are now rendered as plain PackingRow, so useSortable is never
+    // called with disabled:true — labels are fully outside dnd-kit's awareness.
+    expect(labelCalls.length).toBe(0);
   });
 
   it("calls useSortable with animateLayoutChanges that returns false", () => {

diff --git a/src/components/packt/template-library.test.tsx b/src/components/packt/template-library.test.tsx
index b57d7db..26bc13a 100644
--- a/src/components/packt/template-library.test.tsx
+++ b/src/components/packt/template-library.test.tsx
@@ -9,6 +9,11 @@ const templates: PackingTemplate[] = [
   { id: "template-2", name: "Carry-on Only" },
 ];
 
+const duplicateNameTemplates: PackingTemplate[] = [
+  { id: "template-1", name: "Beach Weekend" },
+  { id: "template-2", name: "Beach Weekend" },
+];
+
 describe("TemplateLibrary", () => {
   it("renders the empty state and create action when there are no templates", async () => {
     const user = userEvent.setup();
@@ -28,8 +33,8 @@ describe("TemplateLibrary", () => {
     expect(screen.getByText("Carry-on Only")).toBeInTheDocument();
     expect(screen.getByRole("link", { name: "Beach Weekend" })).toHaveAttribute("href", "/packing/template-1");
     expect(screen.getByRole("link", { name: "Carry-on Only" })).toHaveAttribute("href", "/packing/template-2");
-    expect(screen.getByRole("button", { name: "Rename Beach Weekend" })).toBeInTheDocument();
-    expect(screen.getByRole("button", { name: "Delete Beach Weekend" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Rename Beach Weekend (template-1)" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Delete Beach Weekend (template-1)" })).toBeInTheDocument();
   });
 
   it("calls onNew from the header button", async () => {
@@ -49,10 +54,21 @@ describe("TemplateLibrary", () => {
 
     render(<TemplateLibrary templates={templates} onNew={vi.fn()} onRename={onRename} onDelete={onDelete} />);
 
-    await user.click(screen.getByRole("button", { name: "Rename Carry-on Only" }));
-    await user.click(screen.getByRole("button", { name: "Delete Carry-on Only" }));
+    await user.click(screen.getByRole("button", { name: "Rename Carry-on Only (template-2)" }));
+    await user.click(screen.getByRole("button", { name: "Delete Carry-on Only (template-2)" }));
 
     expect(onRename).toHaveBeenCalledWith(templates[1]);
     expect(onDelete).toHaveBeenCalledWith(templates[1]);
   });
+
+  it("disambiguates duplicate template names in aria-labels", () => {
+    render(
+      <TemplateLibrary templates={duplicateNameTemplates} onNew={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />
+    );
+
+    expect(screen.getByRole("button", { name: "Rename Beach Weekend (template-1)" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Rename Beach Weekend (template-2)" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Delete Beach Weekend (template-1)" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Delete Beach Weekend (template-2)" })).toBeInTheDocument();
+  });
 });

diff --git a/src/components/packt/template-library.tsx b/src/components/packt/template-library.tsx
index 19a3413..4363c99 100644
--- a/src/components/packt/template-library.tsx
+++ b/src/components/packt/template-library.tsx
@@ -84,7 +84,7 @@ export function TemplateLibrary({ templates, onNew, onRename, onDelete }: Templa
                   variant="ghost"
                   size="icon-sm"
                   title={`Rename ${template.name}`}
-                  aria-label={`Rename ${template.name}`}
+                  aria-label={`Rename ${template.name} (${template.id})`}
                   onClick={() => onRename(template)}
                   style={{ minWidth: 44, minHeight: 44 }}
                 >
@@ -95,7 +95,7 @@ export function TemplateLibrary({ templates, onNew, onRename, onDelete }: Templa
                   variant="ghost"
                   size="icon-sm"
                   title={`Delete ${template.name}`}
-                  aria-label={`Delete ${template.name}`}
+                  aria-label={`Delete ${template.name} (${template.id})`}
                   onClick={() => onDelete(template)}
                   style={{ minWidth: 44, minHeight: 44 }}
                 >

diff --git a/src/lib/queries.ts b/src/lib/queries.ts
index 0341879..5e70398 100644
--- a/src/lib/queries.ts
+++ b/src/lib/queries.ts
@@ -131,7 +131,7 @@ export async function listTemplatesForUser(userId: string): Promise<PackingTempl
     .select()
     .from(packingTemplates)
     .where(eq(packingTemplates.userId, userId))
-    .orderBy(asc(packingTemplates.name), asc(packingTemplates.createdAt));
+    .orderBy(asc(sql`LOWER(${packingTemplates.name})`), asc(packingTemplates.createdAt));
 
   return rows.map(dbTemplateToType);
 }

diff --git a/tests/e2e/features/templates.feature b/tests/e2e/features/templates.feature
index 1d4fd58..ee68e78 100644
--- a/tests/e2e/features/templates.feature
+++ b/tests/e2e/features/templates.feature
@@ -48,3 +48,12 @@ Feature: Packing templates
     When I open the templates page
     Then I should see the packing template "Business Trip"
     And I should see the packing template "Winter Ski"
+
+  Scenario: Mixed-case template names stay adjacent
+    Given I have packing templates:
+      | name        |
+      | beach trip  |
+      | Beach Trip  |
+      | Winter Ski  |
+    When I open the templates page
+    Then the packing templates should appear in order "beach trip" then "Beach Trip" then "Winter Ski"

diff --git a/tests/e2e/steps/templates.steps.ts b/tests/e2e/steps/templates.steps.ts
index 9c4aa0f..527ebc4 100644
--- a/tests/e2e/steps/templates.steps.ts
+++ b/tests/e2e/steps/templates.steps.ts
@@ -50,7 +50,7 @@ When("I create a packing template named {string}", async ({ page }, name: string
 });
 
 When("I rename the packing template {string} to {string}", async ({ page }, currentName: string, nextName: string) => {
-  await page.getByRole("button", { name: `Rename ${currentName}` }).click();
+  await page.getByTitle(`Rename ${currentName}`).click();
   const input = page.getByLabel("Template name");
   await input.clear();
   await input.fill(nextName);
@@ -59,7 +59,7 @@ When("I rename the packing template {string} to {string}", async ({ page }, curr
 });
 
 When("I delete the packing template {string}", async ({ page }, name: string) => {
-  await page.getByRole("button", { name: `Delete ${name}` }).click();
+  await page.getByTitle(`Delete ${name}`).click();
   await page.getByRole("button", { name: "Delete" }).click();
   await expect(page.getByText(name)).toHaveCount(0, { timeout: 10_000 });
 });
@@ -82,9 +82,17 @@ Then("I should see the packing template {string}", async ({ page }, name: string
 });
 
 Then("I should not see the packing template {string}", async ({ page }, name: string) => {
-  await expect(page.getByRole("button", { name: `Rename ${name}` })).toHaveCount(0);
+  await expect(page.getByTitle(`Rename ${name}`)).toHaveCount(0);
 });
 
+Then(
+  "the packing templates should appear in order {string} then {string} then {string}",
+  async ({ page }, firstName: string, secondName: string, thirdName: string) => {
+    const templateNames = await page.locator("li a[href^='/packing/']").allTextContents();
+    expect(templateNames.slice(0, 3)).toEqual([firstName, secondName, thirdName]);
+  }
+);
+
 Then("I should see a template validation error", async ({ page }) => {
   await expect(page.getByRole("status")).toHaveText("Template name is required.");
 });
```
