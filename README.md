# EverDungeon Prototype

This repository now contains a playable EverDungeon foundation focused on your core systems:

- First-person DOOM-like movement and rendering.
- Procedural Cavern/Dungeon world split.
- Dense Caverns that are mostly mine-and-build space.
- Dungeon chunks reserved for exploration/resource gathering.
- Object-based ore nodes (ore is no longer a tile block).
- Tool workflows:
- `Pickaxe`: mine ore nodes and mine cavern stone blocks.
- `Hammer`: place stone blocks (from inventory) and workbenches, place crafted wall segments.
- Workbenches:
- `Smelter Workbench`: refine ore into stone via crafting window.
- `Construction Workbench`: 8-slot input crafting with recipes and Craft button.
- Constructed wall segments auto-connect and are rendered as world geometry (not billboards).
- Windowed UI:
- `Player Window` with inventory and small construction panel.
- `Object Window` for interactable object settings/crafting.
- Drag/drop resource icons into input slots.

## Run Locally

From `C:\Codex\EverDungeon`, run:

```powershell
python -m http.server 8080 --directory apps/client
```

Then open [http://localhost:8080](http://localhost:8080).

## Controls

- `Click` game view: capture mouse (Pointer Lock).
- `W A S D`: move / strafe.
- `Shift`: sprint.
- `Mouse`: look around.
- `Mouse1`: primary tool action.
- `Mouse2` or `G`: cycle hammer build mode.
- `1`: equip Pickaxe.
- `2`: equip Hammer.
- `3`: hammer target Stone Block.
- `4`: hammer target Smelter Workbench.
- `5`: hammer target Construction Workbench.
- `6`: hammer target Constructed Wall Segment.
- `F`: interact with targeted crafting object (opens Object Window).
- `Tab`: toggle Player Window.
- `R`: reclaim targeted constructed object.
- Drag resources from inventory into crafting slots and use the `Craft` button.

## Gameplay Loop In This Build

- Mine cavern wall blocks with Pickaxe to collect stone.
- Find dungeon ore nodes and mine them with Pickaxe.
- Place Smelter/Construction benches with Hammer.
- Open object window with `F` or player window with `Tab`.
- Drag/drop resources into crafting input slots and press `Craft` (including shaping `Stone -> Stone Block`).
- Place stone blocks to refill terrain or place connected wall-segment objects for buildings.

## Notes

- Object billboards are ground-anchored.
- Constructed walls are treated as opaque world geometry.
- This is still MVP-level and does not yet include NPCs, combat AI, persistence, or online economy systems.

