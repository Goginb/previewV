# Estimating Integration Guardrails

This folder contains the PreviewV <-> Estimating Tool bridge. Please read this before changing launch flow, save flow, import layout, or per-tile estimating UI.

## Core invariants

1. Direct PreviewV launch must remain normal PreviewV.
   Opening PreviewV from Explorer, a shortcut, or a standalone `.previewv` file must not activate Estimating-specific behavior.

2. Estimating-linked launch must behave like a linked view of the Estimating project.
   In linked mode, PreviewV is not the source of truth. It is a canvas/UI representation of work that still belongs to the Estimating project.

3. Linked mode must auto-save quietly.
   Closing linked PreviewV must not show a save confirmation dialog. Tile positions, backdrops, notes, and estimating values must be flushed automatically.

4. Estimating values must sync back to Estimating Tool, then to Excel.
   Never treat the tile input fields as PreviewV-only local state. If a field stops syncing back, the output Excel chain becomes wrong.

5. The linked `.previewv` sidecar is project-scoped.
   The linked PreviewV file must stay tied to the Estimating project path/basename so reopening the same project restores the same canvas state.

6. The integration layer must stay isolated.
   Keep Estimating-only behavior in `src/integrations/estimating/*` or very thin guarded entry points from `src/App.tsx`. Do not spread Estimating assumptions through generic Add Folder / normal PreviewV flows.

## Import and layout rules

1. First linked import is special.
   When media first enters PreviewV from Estimating, we group tiles by brief and create backdrops/notes automatically.

2. Reopen must preserve layout.
   Reopening linked PreviewV must restore the saved canvas. It must not rebuild groups from scratch if the linked sidecar already has a layout.

3. New media may be appended, existing media must not be reimported blindly.
   Missing media can be added later, but already-linked tiles/backdrops/notes must be preserved.

4. Linked mode is not a freeform media browser.
   Tile deletion is intentionally blocked in linked mode. We work with the project media that Estimating provides.

## Performance rules

1. Avoid full folder rescans on every reopen.
   Repeated linked opens should reuse saved PreviewV project state whenever possible.

2. Avoid unconditional video re-hydration for already-valid linked projects.
   Hydrate only when saved source/proxy information is missing or stale.

3. Far zoom must stay cheap.
   At far zoom, heavy per-tile UI can be skipped, but the actual scene structure should remain visible and should not switch to a misleading black-state optimization.

4. Do not re-enable noisy per-tile video debug by default.
   Event spam from many video tiles can materially hurt navigation and startup.

## Files that matter most

- `src/App.tsx`
  Linked launch bootstrap, linked sidecar open/save, missing media import path.

- `src/integrations/estimating/store.ts`
  Estimating session snapshot, draft state, autosave, sync back to helper.

- `src/integrations/estimating/EstimatingVideoFields.tsx`
  Compact tile UI for writable tasks.

- `src/integrations/estimating/importGroupedMedia.ts`
  First linked import layout rules: grouping by brief, backdrop creation, note creation.

- `src/utils/hydrateProjectVideoSources.ts`
  Safety/performance gate for project video source hydration.

## Before changing this integration

Sanity-check these user-visible scenarios:

1. Direct PreviewV launch still opens normal PreviewV.
2. Open from Estimating restores the same linked canvas without a save dialog on close.
3. Changing a value in PreviewV reaches Estimating Tool and persists with the project.
4. Reopening the same Estimating project restores tile layout, notes, and backdrops.
5. New project media can appear without destroying the existing linked layout.
