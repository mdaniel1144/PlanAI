# Architectural drawing workspace

Create a project and floor, then draw architecture. The header contains Save changes and Export. The canvas toolbar contains Select, Pan, Draw wall, Add door, Add window, Measure, Delete, Undo, and Redo. Double-click the final wall endpoint to finish a chain.

Spaces appear automatically when committed walls define a closed region or an unambiguous open chain. Select a Space to set its name, type, floor elevation, and ceiling elevation. New Spaces have unknown semantics, floor elevation 0 m, and unknown ceiling elevation. Existing saved elevations are preserved. Clear height and Area are derived. Negative elevations are valid. Deleting or moving a wall recomputes affected Spaces in the same local undo step. Room deletion is unavailable for automatically derived Spaces; edit their walls instead. Hosted openings still prevent deleting their host wall.

Advanced geometry contains the existing manual polygon fallback. It is separate from the normal automatic workflow. Double-click the last vertex to finish an explicit manual polygon. Manual geometry retains its separate authority.

V selects, H pans, W draws walls, D adds doors, N adds windows, and M measures. Escape returns to Select. Enter commits an entered length or confirms a window placement outside input controls. Delete removes the selection. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, and Ctrl/Cmd+S saves. Inputs retain normal keyboard behavior, except Escape also cancels window placement from a focused field.

Add window opens its settings card automatically. Hovering a wall shows a ghost that follows the pointer along the host. A click fixes the candidate; adjust Width, Sill Height, and Window Height, then confirm. The reference is shown explicitly, and world bottom/top remain canonical. Configure the assembly in Properties. See the [Window UI and usage guide](WINDOWS.md) for screenshots, field definitions, and the complete workflow.

View contains grid visibility, snapping and spacing, dimensions, labels, floor selection, and editor status. Open boundaries use dashed lines and never create Walls. Area uses the existing wall-centreline polygon convention. Space labels use an interior point for concave polygons. Both viewers use the same canonical IDs and selection. In 3D each known Space floor elevation positions its floor surface; unknown levels do not fabricate a surface height. Ceiling elevation is retained in properties and mesh metadata.

Undo/redo stores up to 100 actions locally. Pointer movement previews wall geometry; committed edits run topology on affected floors. Save validates and replaces current SQLite state using PUT `/api/scenes/:sceneId` with `expectedRevision`. It does not store past states. Successful saves reset local undo. Unsaved navigation prompts to stay or discard; browser reload/close uses the browser's warning. Verification is blocked while the draft is dirty and locks editing while its request is pending.

Geometry and semantics have separate verification claims. Renaming or changing Space type does not verify its boundary. Conflicting wall changes to VERIFIED or USER_CORRECTED Space geometry are rejected with SPACE_GEOMETRY_CONFLICT. The existing explicit entity verification action can verify a saved Space. Open enclosure is a warning, not an automatic architectural error.
