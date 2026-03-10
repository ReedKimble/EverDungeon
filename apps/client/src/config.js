export const CHUNK_TILES = 16;
export const WORLD_CHUNKS = 24;
export const WORLD_TILES = WORLD_CHUNKS * CHUNK_TILES;
export const HALF_CHUNKS = WORLD_CHUNKS / 2;

export const WORLD_SEED = 428721;
export const ORIGIN_TILE = HALF_CHUNKS * CHUNK_TILES + Math.floor(CHUNK_TILES / 2);

export const FOV = Math.PI / 3;
export const MAX_VIEW_DISTANCE = 32;

export const TileType = Object.freeze({
  FLOOR: 0,
  WALL: 1,
});

export const ChunkType = Object.freeze({
  CAVERN: "cavern",
  DUNGEON: "dungeon",
});

export const ObjectType = Object.freeze({
  ORE_NODE: "ore-node",
  WOODY_ROOT: "woody-root",
  MUSHROOM: "mushroom",
  PICKUP: "pickup-item",
  STONE_CUTTER: "stone-cutter-workbench",
  SMELTER: "smelter-workbench",
  STOVE: "stove-workbench",
  CONSTRUCTION_BENCH: "construction-workbench",
  WALL_SEGMENT: "constructed-wall-segment",
  DOOR: "constructed-door",
});

export const ToolId = Object.freeze({
  KNIFE: "knife",
  PICKAXE: "pickaxe",
  HAMMER: "hammer",
});

export const TOOL_DEFINITIONS = Object.freeze({
  [ToolId.KNIFE]: {
    id: ToolId.KNIFE,
    label: "Knife",
    icon: "KN",
    className: "res-toolknife",
  },
  [ToolId.PICKAXE]: {
    id: ToolId.PICKAXE,
    label: "Pickaxe",
    icon: "PK",
    className: "res-toolpickaxe",
  },
  [ToolId.HAMMER]: {
    id: ToolId.HAMMER,
    label: "Hammer",
    icon: "HM",
    className: "res-toolhammer",
  },
});

export const BuildId = Object.freeze({
  STONE_BLOCK: "stone-block",
  STONE_CUTTER: "stone-cutter-workbench",
  SMELTER: "smelter-workbench",
  STOVE: "stove-workbench",
  CONSTRUCTION_BENCH: "construction-workbench",
  WALL_SEGMENT: "wall-segment",
  DOOR: "door",
});

export const StationId = Object.freeze({
  PLAYER: "player-construction",
  STONE_CUTTER: "stone-cutter",
  CONSTRUCTION_BENCH: "construction-bench",
  SMELTER: "smelter",
  STOVE: "stove",
});

export const ResourceId = Object.freeze({
  STONE: "stone",
  STONE_BLOCK: "stoneBlock",
  WOODY_ROOT: "woodyRoot",
  MUSHROOM: "mushroom",
  MEAT: "meat",
  SIMPLE_STEW: "simpleStew",
  COPPER_ORE: "copperOre",
  ZINC_ORE: "zincOre",
  IRON_ORE: "ironOre",
  COPPER_INGOT: "copperIngot",
  ZINC_INGOT: "zincIngot",
  IRON_INGOT: "ironIngot",
  COPPER_COIN: "copperCoin",
  SILVER_COIN: "silverCoin",
  GOLD_COIN: "goldCoin",
  WALL_KIT: "wallKit",
  DOOR_KIT: "doorKit",
});

export const RESOURCE_DEFINITIONS = Object.freeze({
  [ResourceId.STONE]: {
    id: ResourceId.STONE,
    label: "Cut Stone",
    icon: "CS",
    className: "res-cutstone",
  },
  [ResourceId.STONE_BLOCK]: {
    id: ResourceId.STONE_BLOCK,
    label: "Raw Stone",
    icon: "RS",
    className: "res-rawstone",
  },
  [ResourceId.WOODY_ROOT]: {
    id: ResourceId.WOODY_ROOT,
    label: "Wood",
    icon: "WD",
    className: "res-woodyroot",
  },
  [ResourceId.MUSHROOM]: {
    id: ResourceId.MUSHROOM,
    label: "Mushroom",
    icon: "MS",
    className: "res-mushroom",
  },
  [ResourceId.MEAT]: {
    id: ResourceId.MEAT,
    label: "Meat",
    icon: "MT",
    className: "res-meat",
  },
  [ResourceId.SIMPLE_STEW]: {
    id: ResourceId.SIMPLE_STEW,
    label: "Simple Stew",
    icon: "SW",
    className: "res-simplestew",
  },
  [ResourceId.COPPER_ORE]: {
    id: ResourceId.COPPER_ORE,
    label: "Copper Ore",
    icon: "CO",
    className: "res-copperore",
  },
  [ResourceId.ZINC_ORE]: {
    id: ResourceId.ZINC_ORE,
    label: "Zinc Ore",
    icon: "ZO",
    className: "res-zincore",
  },
  [ResourceId.IRON_ORE]: {
    id: ResourceId.IRON_ORE,
    label: "Iron Ore",
    icon: "IO",
    className: "res-ironore",
  },
  [ResourceId.COPPER_INGOT]: {
    id: ResourceId.COPPER_INGOT,
    label: "Copper Ingot",
    icon: "CI",
    className: "res-copperingot",
  },
  [ResourceId.ZINC_INGOT]: {
    id: ResourceId.ZINC_INGOT,
    label: "Zinc Ingot",
    icon: "ZI",
    className: "res-zincingot",
  },
  [ResourceId.IRON_INGOT]: {
    id: ResourceId.IRON_INGOT,
    label: "Iron Ingot",
    icon: "II",
    className: "res-ironingot",
  },
  [ResourceId.COPPER_COIN]: {
    id: ResourceId.COPPER_COIN,
    label: "Copper Coin",
    icon: "CC",
    className: "res-coppercoin",
  },
  [ResourceId.SILVER_COIN]: {
    id: ResourceId.SILVER_COIN,
    label: "Silver Coin",
    icon: "SC",
    className: "res-silvercoin",
  },
  [ResourceId.GOLD_COIN]: {
    id: ResourceId.GOLD_COIN,
    label: "Gold Coin",
    icon: "GC",
    className: "res-goldcoin",
  },
  [ResourceId.WALL_KIT]: {
    id: ResourceId.WALL_KIT,
    label: "Wall Kit",
    icon: "WK",
    className: "res-wallkit",
  },
  [ResourceId.DOOR_KIT]: {
    id: ResourceId.DOOR_KIT,
    label: "Door",
    icon: "DR",
    className: "res-doorkit",
  },
});

export const BUILD_OPTIONS = Object.freeze([
  BuildId.STONE_BLOCK,
  BuildId.STONE_CUTTER,
  BuildId.SMELTER,
  BuildId.STOVE,
  BuildId.CONSTRUCTION_BENCH,
  BuildId.WALL_SEGMENT,
  BuildId.DOOR,
]);

export const TOOLBAR_BINDINGS = Object.freeze([
  { keyCode: "Digit1", keyLabel: "1" },
  { keyCode: "Digit2", keyLabel: "2" },
  { keyCode: "Digit3", keyLabel: "3" },
  { keyCode: "Digit4", keyLabel: "4" },
  { keyCode: "Digit5", keyLabel: "5" },
  { keyCode: "Digit6", keyLabel: "6" },
  { keyCode: "Digit7", keyLabel: "7" },
  { keyCode: "Digit8", keyLabel: "8" },
  { keyCode: "Digit9", keyLabel: "9" },
  { keyCode: "Digit0", keyLabel: "0" },
  { keyCode: "Minus", keyLabel: "-" },
  { keyCode: "Equal", keyLabel: "=" },
]);

export const HOTBAR_BINDINGS = Object.freeze([
  { keyCode: "KeyQ", keyLabel: "Q" },
  { keyCode: "KeyE", keyLabel: "E" },
  { keyCode: "KeyR", keyLabel: "R" },
  { keyCode: "KeyT", keyLabel: "T" },
  { keyCode: "KeyZ", keyLabel: "Z" },
  { keyCode: "KeyX", keyLabel: "X" },
  { keyCode: "KeyC", keyLabel: "C" },
  { keyCode: "KeyV", keyLabel: "V" },
]);

export const BUILD_DEFINITIONS = Object.freeze({
  [BuildId.STONE_BLOCK]: {
    name: "Raw Stone Block",
    icon: "RB",
    costs: { [ResourceId.STONE_BLOCK]: 1 },
  },
  [BuildId.STONE_CUTTER]: {
    name: "Stone Cutter Workbench",
    icon: "SC",
    costs: { [ResourceId.STONE_BLOCK]: 6 },
  },
  [BuildId.SMELTER]: {
    name: "Smelter Workbench",
    icon: "SM",
    costs: { [ResourceId.STONE]: 6, [ResourceId.IRON_INGOT]: 2 },
  },
  [BuildId.STOVE]: {
    name: "Stove Workbench",
    icon: "SV",
    costs: { [ResourceId.STONE]: 3, [ResourceId.IRON_INGOT]: 2 },
  },
  [BuildId.CONSTRUCTION_BENCH]: {
    name: "Construction Workbench",
    icon: "CB",
    costs: { [ResourceId.STONE]: 8 },
  },
  [BuildId.WALL_SEGMENT]: {
    name: "Constructed Wall",
    icon: "WS",
    costs: { [ResourceId.WALL_KIT]: 1 },
  },
  [BuildId.DOOR]: {
    name: "Door",
    icon: "DR",
    costs: { [ResourceId.DOOR_KIT]: 1 },
  },
});

export const CRAFTING_RECIPES = Object.freeze([
  {
    id: "field-cut-stone",
    name: "Field Cut Stone",
    stations: [StationId.PLAYER],
    inputs: { [ResourceId.STONE_BLOCK]: 2 },
    outputs: { [ResourceId.STONE]: 1 },
  },
  {
    id: "cutter-cut-stone",
    name: "Cut Stone Block",
    stations: [StationId.STONE_CUTTER],
    inputs: { [ResourceId.STONE_BLOCK]: 1 },
    outputs: { [ResourceId.STONE]: 1 },
  },
  {
    id: "cutter-wall-kit",
    name: "Cut Stone Wall",
    stations: [StationId.STONE_CUTTER],
    inputs: { [ResourceId.STONE_BLOCK]: 2 },
    outputs: { [ResourceId.WALL_KIT]: 1 },
  },
  {
    id: "wall-kit-reinforced",
    name: "Reinforced Wall Kit",
    stations: [StationId.CONSTRUCTION_BENCH],
    inputs: { [ResourceId.STONE]: 4, [ResourceId.IRON_INGOT]: 1 },
    outputs: { [ResourceId.WALL_KIT]: 2 },
  },
  {
    id: "door-kit-basic",
    name: "Wood Door",
    stations: [StationId.CONSTRUCTION_BENCH],
    inputs: { [ResourceId.WOODY_ROOT]: 2, [ResourceId.ZINC_INGOT]: 1 },
    outputs: { [ResourceId.DOOR_KIT]: 1 },
  },
  {
    id: "smelt-copper",
    name: "Smelt Copper",
    stations: [StationId.SMELTER],
    inputs: { [ResourceId.COPPER_ORE]: 1 },
    outputs: { [ResourceId.COPPER_INGOT]: 1 },
  },
  {
    id: "smelt-zinc",
    name: "Smelt Zinc",
    stations: [StationId.SMELTER],
    inputs: { [ResourceId.ZINC_ORE]: 1 },
    outputs: { [ResourceId.ZINC_INGOT]: 1 },
  },
  {
    id: "smelt-iron",
    name: "Smelt Iron",
    stations: [StationId.SMELTER],
    inputs: { [ResourceId.IRON_ORE]: 1 },
    outputs: { [ResourceId.IRON_INGOT]: 1 },
  },
  {
    id: "stove-simple-stew",
    name: "Simple Stew",
    stations: [StationId.STOVE],
    inputs: { [ResourceId.MEAT]: 1, [ResourceId.MUSHROOM]: 2 },
    outputs: { [ResourceId.SIMPLE_STEW]: 1 },
  },
]);



