import {
  BuildId,
  BUILD_DEFINITIONS,
  BUILD_OPTIONS,
  ChunkType,
  CRAFTING_RECIPES,
  HOTBAR_BINDINGS,
  ObjectType,
  ORIGIN_TILE,
  RESOURCE_DEFINITIONS,
  ResourceId,
  StationId,
  TileType,
  TOOLBAR_BINDINGS,
  TOOL_DEFINITIONS,
  ToolId,
  WORLD_SEED,
} from "./config.js";
import { InputState } from "./input.js";
import { Renderer } from "./renderer.js";
import { random01 } from "./rng.js";
import { Hud } from "./ui.js";
import { createWorld } from "./worldgen.js";

function canOccupy(world, x, y, radius = 0.2, npcs = [], ignoreNpcId = null) {
  const checks = [
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];

  for (const [ox, oy] of checks) {
    if (world.isPointBlocked(x + ox, y + oy)) {
      return false;
    }
  }

  for (const npc of npcs) {
    if (!npc.alive || npc.id === ignoreNpcId) {
      continue;
    }

    const minDistance = radius + npc.radius;
    const dx = x - npc.x;
    const dy = y - npc.y;
    if (dx * dx + dy * dy < minDistance * minDistance) {
      return false;
    }
  }

  return true;
}

function wrapAngle(angle) {
  let next = angle;
  while (next < -Math.PI) {
    next += Math.PI * 2;
  }
  while (next > Math.PI) {
    next -= Math.PI * 2;
  }
  return next;
}

function targetTile(player, distance = 1.18) {
  const tx = Math.floor(player.x + Math.cos(player.angle) * distance);
  const ty = Math.floor(player.y + Math.sin(player.angle) * distance);
  return { tx, ty };
}

function traceLookTarget(world, player, maxDistance = 1.9) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);

  let previousTileX = Math.floor(player.x);
  let previousTileY = Math.floor(player.y);

  for (let distance = 0.2; distance <= maxDistance; distance += 0.04) {
    const sampleX = player.x + dirX * distance;
    const sampleY = player.y + dirY * distance;
    const tileX = Math.floor(sampleX);
    const tileY = Math.floor(sampleY);

    if (tileX === previousTileX && tileY === previousTileY) {
      const object = world.getObject(tileX, tileY);
      if (object) {
        return { kind: "object", tileX, tileY, distance, object };
      }
      continue;
    }

    previousTileX = tileX;
    previousTileY = tileY;

    const object = world.getObject(tileX, tileY);
    if (object) {
      return { kind: "object", tileX, tileY, distance, object };
    }

    if (world.getTile(tileX, tileY) === TileType.WALL) {
      return { kind: "block", tileX, tileY, distance };
    }
  }

  return null;
}

function countSlotResources(slots) {
  const counts = {};
  for (const resourceId of slots) {
    if (!resourceId) {
      continue;
    }

    counts[resourceId] = (counts[resourceId] ?? 0) + 1;
  }
  return counts;
}

function hasRecipeInputs(slots, recipe) {
  const counts = countSlotResources(slots);
  for (const [resourceId, requiredAmount] of Object.entries(recipe.inputs)) {
    if ((counts[resourceId] ?? 0) < requiredAmount) {
      return false;
    }
  }
  return true;
}

function consumeSlotInputs(slots, recipeInputs) {
  for (const [resourceId, requiredAmount] of Object.entries(recipeInputs)) {
    let remaining = requiredAmount;
    for (let i = slots.length - 1; i >= 0 && remaining > 0; i -= 1) {
      if (slots[i] !== resourceId) {
        continue;
      }

      slots[i] = null;
      remaining -= 1;
    }
  }
}

function countEmptySlots(slots) {
  let empty = 0;
  for (const slot of slots) {
    if (!slot) {
      empty += 1;
    }
  }
  return empty;
}

function addResourceToSlots(slots, resourceId, amount) {
  let remaining = amount;
  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    if (slots[i]) {
      continue;
    }

    slots[i] = resourceId;
    remaining -= 1;
  }

  return remaining === 0;
}

const PLAYER_MAX_HEALTH = 100;
const KNIFE_REACH = 1.35;
const KNIFE_RANGE_RADIUS_FACTOR = 0.38;
const KNIFE_DAMAGE = 12;
const KNIFE_SWING_COOLDOWN = 0.34;
const NPC_ATTACK_ANIM_DURATION = 0.44;
const NPC_ATTACK_HIT_PROGRESS = 0.64;
const NPC_ATTACK_RANGE_BUFFER = 0.06;
const PLAYER_HIT_FLASH_DURATION = 0.22;
const DAMAGE_POPUP_DURATION = 0.72;
const PLAYER_MAX_STAMINA = 100;
const PLAYER_MAX_MANA = 100;
const STAMINA_REGEN_DELAY = 1.5;
const STAMINA_REGEN_RATE = 18;
const SIMPLE_STEW_HEAL_TOTAL = 20;
const SIMPLE_STEW_HEAL_DURATION = 30;
const NPC_SPAWN_RADIUS = 20;
const NPC_SPAWN_COUNT_RADIUS = 13;
const NPC_SPAWN_MIN_PLAYER_DISTANCE = 4.5;
const NPC_HOSTILE_SPAWN_INTERVAL = 12;
const NPC_HOSTILE_TARGET_DUNGEON = 4;
const NPC_HOSTILE_START_THRESHOLD = 1;
const NPC_RAT_SPAWN_INTERVAL = 11;
const NPC_RAT_TARGET_DUNGEON = 3;
const NPC_RAT_TARGET_CAVERN = 3;
const NPC_RAT_START_THRESHOLD = 1;
const GOBLIN_SPAWN_POINTS_MIN_PER_REGION = 2;
const GOBLIN_SPAWN_POINTS_MAX_PER_REGION = 4;
const GOBLIN_TUNNEL_SPAWN_POINTS_MIN = 8;
const GOBLIN_TUNNEL_SPAWN_POINTS_MAX = 14;
const GOBLIN_SPAWN_ACTIVATION_RADIUS = 56;
const GOBLIN_RESPAWN_COOLDOWN_MIN = 600;
const GOBLIN_RESPAWN_COOLDOWN_MAX = 1200;
const SMALL_CHEST_SLOT_COUNT = 12;
const ALLIED_AUTOCRAFT_INTERVAL = 3.8;
const ALLIED_GATHER_STACK_TARGET = 10;
const ALLIED_ROOM_HEAL_RATE = 1.6;
const ALLIED_RETREAT_HEALTH_RATIO = 0.5;
const TOOL_SWING_STAMINA_COST = Object.freeze({
  [ToolId.KNIFE]: 8,
  [ToolId.PICKAXE]: 12,
  [ToolId.HAMMER]: 10,
});

const HOTBAR_PAGE_COUNT = 3;
const RECLAIM_KEY_CODE = "KeyU";
const ACTION_ITEM_KIND = Object.freeze({
  TOOL: "tool",
  RESOURCE: "resource",
});
const PLACEABLE_RESOURCE_TO_BUILD = Object.freeze({
  [ResourceId.STONE_BLOCK]: BuildId.STONE_BLOCK,
  [ResourceId.WALL_KIT]: BuildId.WALL_SEGMENT,
  [ResourceId.DOOR_KIT]: BuildId.DOOR,
  [ResourceId.SMALL_CHEST]: BuildId.SMALL_CHEST,
});
const CONSUMABLE_RESOURCE_IDS = new Set([ResourceId.SIMPLE_STEW]);
const DEFAULT_TOOLBAR_LOADOUT = Object.freeze([
  { kind: ACTION_ITEM_KIND.TOOL, id: ToolId.KNIFE },
  { kind: ACTION_ITEM_KIND.TOOL, id: ToolId.PICKAXE },
  { kind: ACTION_ITEM_KIND.TOOL, id: ToolId.HAMMER },
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]);
const DEFAULT_HOTBAR_LOADOUT = Object.freeze([
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]);
const INVENTORY_SLOT_COUNT = 24;
const PICKUP_AUTO_COLLECT_RADIUS = 0.86;
const PLAYER_COLLISION_RADIUS = 0.2;
const NPC_ATTRIBUTE_KEYS = Object.freeze([
  "endurance",
  "stamina",
  "concentration",
  "strength",
  "agility",
  "dexterity",
  "intelligence",
  "wisdom",
  "constitution",
  "diplomacy",
  "eloquence",
  "cunning",
]);
const GOBLIN_QUEST_COLLECTION_RESOURCES = Object.freeze([
  ResourceId.WOODY_ROOT,
  ResourceId.MUSHROOM,
  ResourceId.STONE_BLOCK,
  ResourceId.COPPER_ORE,
  ResourceId.ZINC_ORE,
  ResourceId.IRON_ORE,
]);
const GOBLIN_QUEST_KILL_TARGETS = Object.freeze(["golem"]);
const ALLIED_GATHERABLE_RESOURCES = new Set([
  ResourceId.STONE_BLOCK,
  ResourceId.WOODY_ROOT,
  ResourceId.MUSHROOM,
  ResourceId.COPPER_ORE,
  ResourceId.ZINC_ORE,
  ResourceId.IRON_ORE,
]);
const RESOURCE_TO_REQUIRED_TOOL = Object.freeze({
  [ResourceId.STONE_BLOCK]: ToolId.PICKAXE,
  [ResourceId.WOODY_ROOT]: ToolId.PICKAXE,
  [ResourceId.MUSHROOM]: ToolId.PICKAXE,
  [ResourceId.COPPER_ORE]: ToolId.PICKAXE,
  [ResourceId.ZINC_ORE]: ToolId.PICKAXE,
  [ResourceId.IRON_ORE]: ToolId.PICKAXE,
});

const STATION_OBJECT_TYPES = Object.freeze({
  [StationId.STONE_CUTTER]: ObjectType.STONE_CUTTER,
  [StationId.SMELTER]: ObjectType.SMELTER,
  [StationId.STOVE]: ObjectType.STOVE,
  [StationId.CONSTRUCTION_BENCH]: ObjectType.CONSTRUCTION_BENCH,
});

const CRAFTING_OBJECT_TYPES = new Set([
  ObjectType.STONE_CUTTER,
  ObjectType.SMELTER,
  ObjectType.STOVE,
  ObjectType.CONSTRUCTION_BENCH,
]);

function stationIdForObjectType(objectType) {
  if (objectType === ObjectType.STONE_CUTTER) {
    return StationId.STONE_CUTTER;
  }
  if (objectType === ObjectType.SMELTER) {
    return StationId.SMELTER;
  }
  if (objectType === ObjectType.STOVE) {
    return StationId.STOVE;
  }
  if (objectType === ObjectType.CONSTRUCTION_BENCH) {
    return StationId.CONSTRUCTION_BENCH;
  }
  if (objectType === ObjectType.SMALL_CHEST) {
    return StationId.STORAGE;
  }
  return null;
}
const GOBLIN_QUEST_COMPLETION_RATIO = 0.6;
const GOBLIN_MAX_QUEST_STEPS = 6;
const NPC_LOOT_TABLES = Object.freeze({
  golem: [
    { resourceId: ResourceId.COPPER_COIN, chance: 0.84, min: 3, max: 8 },
    { resourceId: ResourceId.SILVER_COIN, chance: 0.5, min: 1, max: 3 },
    { resourceId: ResourceId.GOLD_COIN, chance: 0.2, min: 1, max: 2 },
    { resourceId: ResourceId.COPPER_ORE, chance: 0.24, min: 1, max: 2 },
    { resourceId: ResourceId.ZINC_ORE, chance: 0.2, min: 1, max: 1 },
    { resourceId: ResourceId.IRON_ORE, chance: 0.17, min: 1, max: 1 },
  ],
  goblin: [],
  rat: [
    { resourceId: ResourceId.MEAT, chance: 0.88, min: 1, max: 2 },
  ],
  ally: [],
});

function randomIntInclusive(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function npcLevelForTile(tileX, tileY, chunkType) {
  const distanceFromOrigin = Math.hypot(tileX - ORIGIN_TILE, tileY - ORIGIN_TILE);
  const distanceTier = Math.floor(distanceFromOrigin / 28);
  const dungeonBonus = chunkType === ChunkType.DUNGEON ? 1 : 0;
  return clampNumber(1 + distanceTier + dungeonBonus, 1, 12);
}

function buildNpcAttributes(kind, level, rngSeedA, rngSeedB) {
  const roleBias = {
    endurance: kind === "golem" ? 12 : kind === "goblin" ? 9 : kind === "rat" ? 6 : 10,
    stamina: kind === "golem" ? 11 : kind === "goblin" ? 9 : kind === "rat" ? 10 : 10,
    concentration: kind === "golem" ? 8 : kind === "goblin" ? 10 : kind === "rat" ? 6 : 9,
    strength: kind === "golem" ? 14 : kind === "goblin" ? 7 : kind === "rat" ? 5 : 9,
    agility: kind === "golem" ? 7 : kind === "goblin" ? 12 : kind === "rat" ? 14 : 9,
    dexterity: kind === "golem" ? 7 : kind === "goblin" ? 12 : kind === "rat" ? 13 : 10,
    intelligence: kind === "golem" ? 6 : kind === "goblin" ? 10 : kind === "rat" ? 4 : 9,
    wisdom: kind === "golem" ? 6 : kind === "goblin" ? 9 : kind === "rat" ? 5 : 10,
    constitution: kind === "golem" ? 13 : kind === "goblin" ? 8 : kind === "rat" ? 6 : 10,
    diplomacy: kind === "golem" ? 3 : kind === "goblin" ? 8 : kind === "rat" ? 2 : 11,
    eloquence: kind === "golem" ? 2 : kind === "goblin" ? 7 : kind === "rat" ? 1 : 11,
    cunning: kind === "golem" ? 4 : kind === "goblin" ? 13 : kind === "rat" ? 11 : 9,
  };

  const stats = {};
  for (let i = 0; i < NPC_ATTRIBUTE_KEYS.length; i += 1) {
    const key = NPC_ATTRIBUTE_KEYS[i];
    const noise = random01(rngSeedA + i * 19, rngSeedB + level * 7, i * 11);
    const growth = Math.floor(level * (0.35 + (i % 4) * 0.06));
    const value = Math.floor((roleBias[key] ?? 8) + growth + noise * 4.2);
    stats[key] = clampNumber(value, 1, 26);
  }

  return stats;
}

function deriveGoblinQuestChainLength(stats, level) {
  const values = Object.values(stats ?? {}).sort((a, b) => b - a);
  const topThree = values.slice(0, 3);
  const topAverage = topThree.length ? topThree.reduce((sum, value) => sum + value, 0) / topThree.length : 8;
  const statBonus = Math.max(0, Math.floor((topAverage - 10) / 3));
  const levelBonus = Math.floor((level - 1) / 4);
  return clampNumber(1 + statBonus + levelBonus, 1, GOBLIN_MAX_QUEST_STEPS);
}

function describeQuestStep(step) {
  if (!step) {
    return "No active objective.";
  }

  const progress = step.progress + "/" + step.required;
  if (step.type === "kill") {
    const label = step.targetKind === "golem" ? "Golem" : "Target";
    return "Defeat " + step.required + " " + label + (step.required === 1 ? "" : "s") + " (" + progress + ")";
  }

  const resourceLabel = RESOURCE_DEFINITIONS[step.resourceId]?.label ?? "Resource";
  return "Collect " + step.required + " " + resourceLabel + " (" + progress + ")";
}

function npcDisplayName(npc) {
  if (!npc) {
    return "Enemy";
  }

  if (npc.kind === "goblin") {
    return npc.category === "allied" ? "Goblin Ally" : "Goblin";
  }

  if (npc.kind === "rat") {
    return "Rat";
  }

  if (npc.kind === "ally") {
    return "Ally";
  }

  return "Golem";
}

function isNpcHostile(npc) {
  if (!npc?.alive) {
    return false;
  }

  if (npc.category === "hostile") {
    return true;
  }

  return npc.category === "agnostic" && !!npc.provoked;
}

function traceNpcLookTarget(player, npcs, maxDistance = 1.9) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  let best = null;

  for (const npc of npcs) {
    if (!npc.alive) {
      continue;
    }

    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    const directDistance = Math.hypot(dx, dy);
    if (directDistance > maxDistance) {
      continue;
    }

    const forward = dx * dirX + dy * dirY;
    if (forward <= 0.12) {
      continue;
    }

    const lateral = Math.abs(-dirY * dx + dirX * dy);
    const hitRadius = npc.radius + 0.14;
    if (lateral > hitRadius) {
      continue;
    }

    if (!best || forward < best.forwardDistance) {
      best = {
        kind: "npc",
        npc,
        distance: directDistance,
        forwardDistance: forward,
        tileX: Math.floor(npc.x),
        tileY: Math.floor(npc.y),
      };
    }
  }

  return best;
}

function buildNpcProfile(kind, level = 1) {
  const levelFactor = Math.max(0, level - 1);

  if (kind === "goblin") {
    return {
      category: "agnostic",
      radius: 0.24,
      health: 22 + levelFactor * 4,
      speed: 2.2 + Math.min(0.36, levelFactor * 0.03),
      aggroRange: 7.2 + levelFactor * 0.12,
      attackRange: 0.7,
      attackDamage: 5 + Math.floor(levelFactor * 1.25),
      attackInterval: Math.max(0.6, 0.86 - levelFactor * 0.016),
      provoked: false,
      touchAggroDistance: 0.46,
    };
  }

  if (kind === "rat") {
    return {
      category: "agnostic",
      radius: 0.17,
      health: 12 + levelFactor * 3,
      speed: 2.7 + Math.min(0.45, levelFactor * 0.03),
      aggroRange: 6.4 + levelFactor * 0.1,
      attackRange: 0.56,
      attackDamage: 3 + Math.floor(levelFactor * 0.9),
      attackInterval: Math.max(0.48, 0.72 - levelFactor * 0.012),
      provoked: false,
      touchAggroDistance: 0.4,
    };
  }

  if (kind === "ally") {
    return {
      category: "allied",
      radius: 0.24,
      health: 30 + levelFactor * 5,
      speed: 2.05 + Math.min(0.3, levelFactor * 0.02),
      aggroRange: 0,
      attackRange: 0,
      attackDamage: 0,
      attackInterval: 0,
      provoked: false,
      touchAggroDistance: 0,
      followDistance: 1.8,
      settleDistance: 2.4,
    };
  }

  return {
    category: "hostile",
    radius: 0.29,
    health: 38 + levelFactor * 7,
    speed: 1.95 + Math.min(0.45, levelFactor * 0.03),
    aggroRange: 8.8 + levelFactor * 0.14,
    attackRange: 0.8,
    attackDamage: 8 + Math.floor(levelFactor * 1.6),
    attackInterval: Math.max(0.58, 0.9 - levelFactor * 0.016),
    provoked: true,
    touchAggroDistance: 0,
  };
}

function createNpcEntity(id, kind, x, y, profile, level, rngSeedA, rngSeedB) {
  const stats = buildNpcAttributes(kind, level, rngSeedA, rngSeedB);
  return {
    id,
    kind,
    category: profile.category,
    level,
    stats,
    x,
    y,
    radius: profile.radius,
    alive: true,
    health: profile.health,
    maxHealth: profile.health,
    speed: profile.speed,
    aggroRange: profile.aggroRange,
    attackRange: profile.attackRange,
    attackDamage: profile.attackDamage,
    attackInterval: profile.attackInterval,
    attackCooldown: random01(rngSeedA, id, 59) * 0.35,
    hurtTimer: 0,
    attackAnim: 0,
    attackAnimDuration: NPC_ATTACK_ANIM_DURATION,
    attackHitProgress: NPC_ATTACK_HIT_PROGRESS,
    attackDidHit: false,
    hitReactX: 0,
    hitReactY: 0,
    walkCycle: random01(rngSeedB, id, 71) * Math.PI * 2,
    walkAmount: 0,
    deathTimer: 0,
    provoked: profile.provoked,
    touchAggroDistance: profile.touchAggroDistance ?? 0,
    followDistance: profile.followDistance ?? 1.8,
    settleDistance: profile.settleDistance ?? 2.4,
    settled: false,
    homeTileX: null,
    homeTileY: null,
    homeDoorTileX: null,
    homeDoorTileY: null,
    wanderTargetTileX: null,
    wanderTargetTileY: null,
    wanderCooldown: 0,
    quest: null,
    questChainLength: kind === "goblin" ? deriveGoblinQuestChainLength(stats, level) : 0,
    toolInventory: [],
    desiredCraftRecipeId: null,
    autoCraftCooldown: 0,
    gatherResourceId: null,
    gatheredCount: 0,
    gatherTargetCount: ALLIED_GATHER_STACK_TARGET,
    gatherTargetTileX: null,
    gatherTargetTileY: null,
    gatherTargetObjectId: null,
    gatherStandTileX: null,
    gatherStandTileY: null,
    gatherActionCooldown: 0,
    recovering: false,
  };
}

function spawnInitialNpcs(world, seed, desiredCount = 34) {
  const npcs = [];

  const canPlaceAt = (x, y) =>
    !npcs.some((npc) => {
      const dx = npc.x - x;
      const dy = npc.y - y;
      return dx * dx + dy * dy < 2.1 * 2.1;
    });

  for (let attempt = 0; attempt < desiredCount * 60 && npcs.length < desiredCount; attempt += 1) {
    const tileX = Math.floor(random01(seed + 901, attempt, 17) * world.worldTiles);
    const tileY = Math.floor(random01(seed + 907, attempt, 31) * world.worldTiles);

    if (Math.abs(tileX - ORIGIN_TILE) < 8 && Math.abs(tileY - ORIGIN_TILE) < 8) {
      continue;
    }

    if (!world.isWalkableTile(tileX, tileY)) {
      continue;
    }

    const chunkType = world.chunkTypeAtTile(tileX, tileY);
    const spawnRoll = random01(seed + 919, attempt, 47);

    let kind = null;
    if (chunkType === ChunkType.DUNGEON) {
      kind = "golem";
    } else {
      continue;
    }

    const x = tileX + 0.5;
    const y = tileY + 0.5;
    if (!canPlaceAt(x, y)) {
      continue;
    }

    const level = npcLevelForTile(tileX, tileY, chunkType);
    const profile = buildNpcProfile(kind, level);
    npcs.push(
      createNpcEntity(
        npcs.length + 1,
        kind,
        x,
        y,
        profile,
        level,
        seed + 929 + attempt,
        seed + 941 + attempt,
      ),
    );
  }

  const ensureKind = (kind, preferredChunkType = null, seedOffset = 0) => {
    if (npcs.some((npc) => npc.kind === kind)) {
      return true;
    }

    for (let attempt = 0; attempt < 1200; attempt += 1) {
      const tileX = Math.floor(random01(seed + 1229 + seedOffset, attempt, 53) * world.worldTiles);
      const tileY = Math.floor(random01(seed + 1297 + seedOffset, attempt, 67) * world.worldTiles);

      if (Math.abs(tileX - ORIGIN_TILE) < 7 && Math.abs(tileY - ORIGIN_TILE) < 7) {
        continue;
      }

      if (!world.isWalkableTile(tileX, tileY)) {
        continue;
      }

      const chunkType = world.chunkTypeAtTile(tileX, tileY);
      if (preferredChunkType && chunkType !== preferredChunkType) {
        continue;
      }

      const x = tileX + 0.5;
      const y = tileY + 0.5;
      if (!canPlaceAt(x, y)) {
        continue;
      }

      const level = npcLevelForTile(tileX, tileY, chunkType);
      const profile = buildNpcProfile(kind, level);
      npcs.push(
        createNpcEntity(
          npcs.length + 1,
          kind,
          x,
          y,
          profile,
          level,
          seed + 1409 + seedOffset + attempt,
          seed + 1493 + seedOffset + attempt,
        ),
      );
      return true;
    }

    return false;
  };

  ensureKind("golem", ChunkType.DUNGEON, 13);

  return npcs;
}

function resourceString(resources) {
  return Object.entries(resources)
    .map(([resourceId, amount]) => `${RESOURCE_DEFINITIONS[resourceId]?.icon ?? resourceId.toUpperCase()} ${amount}`)
    .join(" + ");
}

function toolOutputString(toolOutputs = {}) {
  return Object.entries(toolOutputs)
    .filter(([, amount]) => amount > 0)
    .map(([toolId, amount]) => `${TOOL_DEFINITIONS[toolId]?.icon ?? toolId.toUpperCase()} ${amount}`)
    .join(" + ");
}

function recipeOutputString(recipe) {
  const resourceOutputs = resourceString(recipe.outputs ?? {});
  const toolOutputs = toolOutputString(recipe.toolOutputs ?? {});
  if (resourceOutputs && toolOutputs) {
    return `${resourceOutputs} + ${toolOutputs}`;
  }

  return resourceOutputs || toolOutputs || "None";
}
function cloneLoadoutItem(item) {
  if (!item) {
    return null;
  }

  return {
    kind: item.kind,
    id: item.id,
  };
}

function normalizeLoadoutItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.kind === ACTION_ITEM_KIND.TOOL) {
    return TOOL_DEFINITIONS[item.id] ? { kind: ACTION_ITEM_KIND.TOOL, id: item.id } : null;
  }

  if (item.kind === ACTION_ITEM_KIND.RESOURCE) {
    return RESOURCE_DEFINITIONS[item.id] ? { kind: ACTION_ITEM_KIND.RESOURCE, id: item.id } : null;
  }

  return null;
}

function createLoadoutSlots(defaults, slotCount) {
  const slots = Array(slotCount).fill(null);
  for (let i = 0; i < slotCount; i += 1) {
    slots[i] = cloneLoadoutItem(defaults[i] ?? null);
  }
  return slots;
}

function loadoutItemsEqual(a, b) {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.kind === b.kind && a.id === b.id;
}

export class Game {
  constructor() {
    this.viewCanvas = document.getElementById("view");
    this.minimapCanvas = document.getElementById("minimap");

    this.world = createWorld(WORLD_SEED);
    this.input = new InputState(this.viewCanvas);
    this.renderer = new Renderer(this.viewCanvas, this.minimapCanvas);
    this.hud = new Hud(TOOLBAR_BINDINGS, HOTBAR_BINDINGS, {
      onUiAction: (action) => this.handleUiAction(action),
    });

    this.state = {
      world: this.world,
      player: {
        x: ORIGIN_TILE + 0.5,
        y: ORIGIN_TILE + 0.5,
        angle: 0,
        eyeHeight: 0.58,
        moveSpeed: 3.4,
        sprintMultiplier: 1.55,
        health: PLAYER_MAX_HEALTH,
        maxHealth: PLAYER_MAX_HEALTH,
        hurtTimer: 0,
        hurtFlash: 0,
        stamina: PLAYER_MAX_STAMINA,
        maxStamina: PLAYER_MAX_STAMINA,
        mana: PLAYER_MAX_MANA,
        maxMana: PLAYER_MAX_MANA,
        staminaRegenLockout: 0,
        activeHeals: [],
      },
      resources: {
        [ResourceId.COPPER_ORE]: 0,
        [ResourceId.ZINC_ORE]: 0,
        [ResourceId.IRON_ORE]: 0,
        [ResourceId.COPPER_INGOT]: 0,
        [ResourceId.ZINC_INGOT]: 0,
        [ResourceId.IRON_INGOT]: 2,
        [ResourceId.COPPER_COIN]: 0,
        [ResourceId.SILVER_COIN]: 0,
        [ResourceId.GOLD_COIN]: 0,
        [ResourceId.STONE]: 12,
        [ResourceId.STONE_BLOCK]: 6,
        [ResourceId.WOODY_ROOT]: 0,
        [ResourceId.MUSHROOM]: 0,
        [ResourceId.MEAT]: 0,
        [ResourceId.SIMPLE_STEW]: 0,
        [ResourceId.SMALL_CHEST]: 0,
        [ResourceId.WALL_KIT]: 0,
        [ResourceId.DOOR_KIT]: 0,
      },
      currentChunkType: ChunkType.CAVERN,
      pointerLocked: false,
      toolbarSlots: createLoadoutSlots(DEFAULT_TOOLBAR_LOADOUT, TOOLBAR_BINDINGS.length),
      hotbars: Array.from(
        { length: HOTBAR_PAGE_COUNT },
        (_, index) => createLoadoutSlots(index === 0 ? DEFAULT_HOTBAR_LOADOUT : [], HOTBAR_BINDINGS.length),
      ),
      activeHotbarIndex: 0,
      ownedTools: {
        [ToolId.KNIFE]: true,
        [ToolId.PICKAXE]: true,
        [ToolId.HAMMER]: true,
      },
      selectedSlot: 0,
      selectedTool: ToolId.KNIFE,
      selectedBuild: BuildId.STONE_BLOCK,
      lookTarget: null,
      viewModel: {
        swing: 0,
        bob: 0,
      },
      combat: {
        attackCooldown: 0,
        kills: 0,
        hostiles: 0,
        npcSummary: { hostile: 0, agnostic: 0, allied: 0 },
        damagePopups: [],
        nextDamagePopupId: 1,
      },
      questProgress: {
        kills: {},
        collection: {},
      },
      npcs: spawnInitialNpcs(this.world, WORLD_SEED),
      ui: {
        playerWindowOpen: false,
        hammerWindowOpen: false,
        objectWindowOpen: false,
        objectWindowObjectId: null,
        questJournalOpen: false,
        questJournalTab: "active",
        playerConstruction: {
          stationId: StationId.PLAYER,
          slots: Array(4).fill(null),
          selectedRecipeId: "field-cut-stone",
        },
      },
    };

    this.nextNpcId = (this.state.npcs.at(-1)?.id ?? 0) + 1;
    this.spawnState = {
      hostileTimer: NPC_HOSTILE_SPAWN_INTERVAL,
      ratTimer: NPC_RAT_SPAWN_INTERVAL * 0.6,
      salt: 1,
    };

    const goblinSpawnSetup = this.initializeGoblinSpawnPoints();
    this.goblinSpawnRegions = goblinSpawnSetup.regions;
    this.goblinSpawnRegionById = new Map(goblinSpawnSetup.regions.map((region) => [region.id, region]));
    this.goblinSpawnPoints = goblinSpawnSetup.points;

    this.lastFrame = performance.now();

    this.viewCanvas.addEventListener("click", () => {
      this.input.requestPointerLock();
    });
    this.viewCanvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    document.addEventListener("pointerlockchange", () => {
      this.state.pointerLocked = this.input.pointerLocked;
      this.hud.setPointerLock(this.input.pointerLocked);
    });

    this.hud.setToolbarActive(this.state.selectedSlot);
    this.hud.pushMessage("Updated: Drag inventory items onto toolbar and hotbar slots. Mouse wheel cycles toolbar, hotbar uses Q/E/R/T/Z/X/C/V.");
    this.hud.pushMessage("F interacts with NPCs, doors, and crafting objects. TAB opens player window. J opens quest journal. U reclaims placed objects.");

    this.refreshHud();
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  frame(time) {
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;

    this.update(dt);
    this.renderer.render(this.state);

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(dt) {
    const player = this.state.player;

    const mouseDelta = this.input.consumeMouseDeltaX();
    player.angle = wrapAngle(player.angle + mouseDelta * 0.0022);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);
    player.staminaRegenLockout = Math.max(0, player.staminaRegenLockout - dt);
    if (player.staminaRegenLockout <= 0 && player.stamina < player.maxStamina) {
      player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA_REGEN_RATE * dt);
    }
    this.state.combat.attackCooldown = Math.max(0, this.state.combat.attackCooldown - dt);
    this.updateActiveHealing(dt);
    this.updateNpcs(dt);
    this.updateNpcSpawning(dt);
    this.updateGoblinSpawnPoints(dt);
    const hostileCount = this.state.npcs.filter((npc) => isNpcHostile(npc)).length;
    const agnosticCount = this.state.npcs.filter(
      (npc) => npc.alive && npc.category === "agnostic" && !npc.provoked,
    ).length;
    const alliedCount = this.state.npcs.filter((npc) => npc.alive && npc.category === "allied").length;
    this.state.combat.hostiles = hostileCount;
    this.state.combat.npcSummary = {
      hostile: hostileCount,
      agnostic: agnosticCount,
      allied: alliedCount,
    };
    this.updateDamagePopups(dt);

    const worldLookTarget = traceLookTarget(this.world, this.state.player);
    const maxNpcTargetDistance = worldLookTarget?.distance ?? 1.9;
    const npcLookTarget = traceNpcLookTarget(this.state.player, this.state.npcs, maxNpcTargetDistance);
    this.state.lookTarget = npcLookTarget ?? worldLookTarget;
    if (this.state.lookTarget?.kind === "npc") {
      const npc = this.state.lookTarget.npc;
      const knifeReach = KNIFE_REACH + (npc?.radius ?? 0) * KNIFE_RANGE_RADIUS_FACTOR;
      const enemyReach = (npc?.attackRange ?? 0.78) + 0.2 + NPC_ATTACK_RANGE_BUFFER;
      this.state.lookTarget.knifeReach = knifeReach;
      this.state.lookTarget.inKnifeRange = this.state.lookTarget.distance <= knifeReach;
      this.state.lookTarget.enemyInRange = this.state.lookTarget.distance <= enemyReach;
      this.state.lookTarget.enemyWindingUp = (npc?.attackAnim ?? 0) > 0 && !(npc?.attackDidHit ?? false);
    }

    this.handleToolbarInput();
    this.handleGeneralActions();

    const windowsOpen = this.windowsOpen();

    if (!windowsOpen) {
      let forward = 0;
      let strafe = 0;

      if (this.input.isDown("KeyW")) {
        forward += 1;
      }
      if (this.input.isDown("KeyS")) {
        forward -= 1;
      }
      if (this.input.isDown("KeyD")) {
        strafe += 1;
      }
      if (this.input.isDown("KeyA")) {
        strafe -= 1;
      }

      const hasMovement = forward !== 0 || strafe !== 0;
      if (hasMovement) {
        const moveScale = forward !== 0 && strafe !== 0 ? Math.SQRT1_2 : 1;
        const sprint = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
        const speed = player.moveSpeed * (sprint ? player.sprintMultiplier : 1) * moveScale;

        const forwardX = Math.cos(player.angle);
        const forwardY = Math.sin(player.angle);
        const strafeX = -Math.sin(player.angle);
        const strafeY = Math.cos(player.angle);

        const dx = (forwardX * forward + strafeX * strafe) * speed * dt;
        const dy = (forwardY * forward + strafeY * strafe) * speed * dt;

        const nextX = player.x + dx;
        const nextY = player.y + dy;

        if (canOccupy(this.world, nextX, player.y, PLAYER_COLLISION_RADIUS, this.state.npcs)) {
          player.x = nextX;
        }
        if (canOccupy(this.world, player.x, nextY, PLAYER_COLLISION_RADIUS, this.state.npcs)) {
          player.y = nextY;
        }

        this.state.viewModel.bob += dt * (sprint ? 10 : 7);
      }
    }

    this.collectNearbyPickups();

    this.state.viewModel.swing = Math.max(0, this.state.viewModel.swing - dt * 3.6);

    this.syncObjectWindowValidity();

    this.state.currentChunkType =
      this.world.chunkTypeAtTile(Math.floor(player.x), Math.floor(player.y)) ?? ChunkType.CAVERN;

    this.refreshHud();
  }

  updateNpcs(dt) {
    const player = this.state.player;

    for (const npc of this.state.npcs) {
      npc.hurtTimer = Math.max(0, (npc.hurtTimer ?? 0) - dt);
      npc.attackCooldown = Math.max(0, (npc.attackCooldown ?? 0) - dt);
      npc.attackAnim = Math.max(0, (npc.attackAnim ?? 0) - dt);
      npc.walkAmount = Math.max(0, (npc.walkAmount ?? 0) - dt * 4.8);
      npc.gatherActionCooldown = Math.max(0, (npc.gatherActionCooldown ?? 0) - dt);

      if (!npc.alive) {
        npc.deathTimer = Math.max(0, (npc.deathTimer ?? 0) - dt);
        continue;
      }

      const dx = player.x - npc.x;
      const dy = player.y - npc.y;
      const distance = Math.hypot(dx, dy);

      if (npc.category === "allied") {
        this.updateAlliedNpc(npc, player, distance, dx, dy, dt);
        continue;
      }

      const attackDuration = npc.attackAnimDuration ?? NPC_ATTACK_ANIM_DURATION;
      const attackHitProgress = npc.attackHitProgress ?? NPC_ATTACK_HIT_PROGRESS;

      if (npc.category === "agnostic" && !npc.provoked) {
        const touchAggroDistance = Math.max(
          npc.touchAggroDistance ?? 0,
          PLAYER_COLLISION_RADIUS + (npc.radius ?? 0) - 0.02,
        );
        if (distance <= touchAggroDistance) {
          npc.provoked = true;
          npc.attackCooldown = Math.min(npc.attackCooldown, 0.16);
          this.hud.pushMessage(`${npcDisplayName(npc)} is provoked and becomes hostile.`);
        } else {
          continue;
        }
      }

      const aggressive = npc.category === "hostile" || (npc.category === "agnostic" && npc.provoked);
      if (!aggressive) {
        continue;
      }

      if (npc.attackAnim > 0 && !npc.attackDidHit && attackDuration > 0) {
        const progress = 1 - Math.max(0, Math.min(1, npc.attackAnim / attackDuration));
        if (progress >= attackHitProgress) {
          const strikeReach = (npc.attackRange ?? 0.78) + PLAYER_COLLISION_RADIUS + NPC_ATTACK_RANGE_BUFFER;
          if (distance <= strikeReach) {
            player.health = Math.max(0, player.health - npc.attackDamage);
            player.hurtTimer = 0.2;
            player.hurtFlash = PLAYER_HIT_FLASH_DURATION;
            this.hud.pushMessage(`${npcDisplayName(npc)} strikes you (-${npc.attackDamage} HP).`);
            if (player.health <= 0) {
              this.handlePlayerDefeat();
              break;
            }
          }
          npc.attackDidHit = true;
        }
      }

      if (npc.attackAnim <= 0) {
        npc.attackDidHit = false;
      }

      if (distance > npc.aggroRange) {
        continue;
      }

      if (distance > npc.attackRange * 0.92 && npc.attackAnim <= 0) {
        const invDistance = distance > 0.0001 ? 1 / distance : 0;
        const step = npc.speed * dt;
        const moveX = dx * invDistance * step;
        const moveY = dy * invDistance * step;
        const prevX = npc.x;
        const prevY = npc.y;
        const nextX = npc.x + moveX;
        const nextY = npc.y + moveY;

        if (canOccupy(this.world, nextX, npc.y, npc.radius, this.state.npcs, npc.id)) {
          npc.x = nextX;
        }
        if (canOccupy(this.world, npc.x, nextY, npc.radius, this.state.npcs, npc.id)) {
          npc.y = nextY;
        }

        const moved = Math.hypot(npc.x - prevX, npc.y - prevY);
        if (moved > 0.0004) {
          npc.walkCycle = (npc.walkCycle ?? 0) + moved * 18;
          npc.walkAmount = Math.min(1, (npc.walkAmount ?? 0) + dt * 9);
        }
        continue;
      }

      if (npc.attackCooldown <= 0 && npc.attackAnim <= 0) {
        npc.attackCooldown = npc.attackInterval;
        npc.attackAnim = attackDuration;
        npc.attackDidHit = false;
      }
    }

    this.state.npcs = this.state.npcs.filter((npc) => npc.alive || npc.deathTimer > 0);
  }

  updateAlliedNpc(npc, player, distance, dx, dy, dt) {
    if (!npc.settled) {
      const followDistance = npc.followDistance ?? 1.8;

      if (distance > followDistance) {
        this.moveNpcToward(npc, player.x, player.y, dt, 1);
      }

      const settleDistance = npc.settleDistance ?? 2.4;
      if (distance <= settleDistance) {
        const settlement = this.findSettlementTileForNpc(npc, Math.floor(npc.x), Math.floor(npc.y));
        if (settlement) {
          const distanceToRoomCenter = Math.hypot(settlement.roomCenterX - npc.x, settlement.roomCenterY - npc.y);
          if (distanceToRoomCenter <= 1.15) {
            npc.settled = true;
            npc.homeTileX = settlement.tileX;
            npc.homeTileY = settlement.tileY;
            npc.homeDoorTileX = settlement.doorTileX;
            npc.homeDoorTileY = settlement.doorTileY;
            npc.wanderTargetTileX = null;
            npc.wanderTargetTileY = null;
            npc.wanderCooldown = 1.2 + Math.random() * 1.4;
            npc.autoCraftCooldown = 0;
            npc.recovering = false;

            const settleX = settlement.tileX + 0.5;
            const settleY = settlement.tileY + 0.5;
            if (canOccupy(this.world, settleX, settleY, npc.radius, this.state.npcs, npc.id)) {
              npc.x = settleX;
              npc.y = settleY;
            }

            this.hud.pushMessage("An ally takes up residence in this room.");
          }
        }
      }
      return;
    }

    const homeTileX = npc.homeTileX ?? Math.floor(npc.x);
    const homeTileY = npc.homeTileY ?? Math.floor(npc.y);
    const homeX = homeTileX + 0.5;
    const homeY = homeTileY + 0.5;
    const homeDx = homeX - npc.x;
    const homeDy = homeY - npc.y;
    const homeDistance = Math.hypot(homeDx, homeDy);

    const room = this.getSettledNpcRoom(npc);
    if (room) {
      const tileX = Math.floor(npc.x);
      const tileY = Math.floor(npc.y);
      const insideRoom = tileX > room.minX && tileX < room.maxX && tileY > room.minY && tileY < room.maxY;
      if (insideRoom && npc.health < npc.maxHealth) {
        npc.health = Math.min(npc.maxHealth, npc.health + ALLIED_ROOM_HEAL_RATE * dt);
      }
    }

    if (npc.gatherResourceId) {
      const gathering = this.updateAlliedGatherTask(npc, dt);
      if (gathering) {
        return;
      }
    }

    this.updateAlliedAutoCraft(npc, dt);

    if (npc.recovering) {
      if (homeDistance > 0.42) {
        this.moveNpcToward(npc, homeX, homeY, dt, 0.85);
        return;
      }

      if (npc.health >= npc.maxHealth * 0.9) {
        npc.recovering = false;
      }
    }

    npc.wanderCooldown = Math.max(0, (npc.wanderCooldown ?? 0) - dt);

    if ((npc.wanderTargetTileX == null || npc.wanderTargetTileY == null) && npc.wanderCooldown <= 0) {
      const nextTarget = this.pickAlliedWanderTile(npc);
      if (nextTarget) {
        npc.wanderTargetTileX = nextTarget.tileX;
        npc.wanderTargetTileY = nextTarget.tileY;
      }
      npc.wanderCooldown = 2 + Math.random() * 3;
    }

    const targetTileX = npc.wanderTargetTileX ?? homeTileX;
    const targetTileY = npc.wanderTargetTileY ?? homeTileY;

    if (!this.canSettleNpcAt(npc, targetTileX, targetTileY, { allowDoorProximity: true })) {
      npc.wanderTargetTileX = null;
      npc.wanderTargetTileY = null;
    }

    const travelTileX = npc.wanderTargetTileX ?? homeTileX;
    const travelTileY = npc.wanderTargetTileY ?? homeTileY;
    const targetX = travelTileX + 0.5;
    const targetY = travelTileY + 0.5;
    const targetDistance = Math.hypot(targetX - npc.x, targetY - npc.y);

    if (targetDistance > 0.08) {
      this.moveNpcToward(npc, targetX, targetY, dt, 0.45);
    } else if (npc.wanderTargetTileX != null && npc.wanderTargetTileY != null) {
      npc.wanderTargetTileX = null;
      npc.wanderTargetTileY = null;
      npc.wanderCooldown = 1.5 + Math.random() * 3.5;
    }

    if (homeDistance > 3.8) {
      npc.wanderTargetTileX = homeTileX;
      npc.wanderTargetTileY = homeTileY;
      npc.wanderCooldown = 0;
    }
  }

  canSettleNpcAt(npc, tileX, tileY, options = {}) {
    const allowDoorProximity = !!options.allowDoorProximity;
    const room = options.roomData ?? this.getConstructedRoomAt(tileX, tileY);

    if (!this.world.inTileBounds(tileX, tileY)) {
      return false;
    }

    if (this.world.chunkTypeAtTile(tileX, tileY) !== ChunkType.CAVERN) {
      return false;
    }

    if (!this.world.isWalkableTile(tileX, tileY)) {
      return false;
    }

    if (!room) {
      return false;
    }

    const nearestDoorDistanceSq = room.doors.reduce((best, door) => {
      const dx = door.tileX - tileX;
      const dy = door.tileY - tileY;
      return Math.min(best, dx * dx + dy * dy);
    }, Number.POSITIVE_INFINITY);

    if (!allowDoorProximity && nearestDoorDistanceSq <= 2) {
      return false;
    }

    for (const other of this.state.npcs) {
      if (!other.alive || other.id === npc.id || other.category !== "allied" || !other.settled) {
        continue;
      }

      const dx = (other.homeTileX ?? Math.floor(other.x)) - tileX;
      const dy = (other.homeTileY ?? Math.floor(other.y)) - tileY;
      if (dx * dx + dy * dy < 36) {
        return false;
      }
    }

    return true;
  }

  scanConstructedBoundary(tileX, tileY, stepX, stepY, maxSteps = 8) {
    for (let step = 1; step <= maxSteps; step += 1) {
      const sampleX = tileX + stepX * step;
      const sampleY = tileY + stepY * step;

      if (!this.world.inTileBounds(sampleX, sampleY)) {
        return null;
      }

      const object = this.world.getObject(sampleX, sampleY);
      if (object?.type === ObjectType.WALL_SEGMENT || object?.type === ObjectType.DOOR) {
        return {
          tileX: sampleX,
          tileY: sampleY,
          dist: step,
          type: object.type,
        };
      }

      if (this.world.getTile(sampleX, sampleY) !== TileType.FLOOR) {
        return null;
      }
    }

    return null;
  }

  getConstructedRoomAt(tileX, tileY, maxSteps = 8) {
    if (!this.world.inTileBounds(tileX, tileY)) {
      return null;
    }

    if (this.world.getTile(tileX, tileY) !== TileType.FLOOR) {
      return null;
    }

    const north = this.scanConstructedBoundary(tileX, tileY, 0, -1, maxSteps);
    const south = this.scanConstructedBoundary(tileX, tileY, 0, 1, maxSteps);
    const west = this.scanConstructedBoundary(tileX, tileY, -1, 0, maxSteps);
    const east = this.scanConstructedBoundary(tileX, tileY, 1, 0, maxSteps);

    if (!north || !south || !west || !east) {
      return null;
    }

    const minX = tileX - west.dist;
    const maxX = tileX + east.dist;
    const minY = tileY - north.dist;
    const maxY = tileY + south.dist;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    if (width < 3 || height < 3) {
      return null;
    }

    const doors = [];
    const addDoorIfPresent = (x, y) => {
      const object = this.world.getObject(x, y);
      if (object?.type === ObjectType.DOOR) {
        doors.push({ tileX: x, tileY: y });
      }
    };

    for (let x = minX; x <= maxX; x += 1) {
      addDoorIfPresent(x, minY);
      addDoorIfPresent(x, maxY);
    }
    for (let y = minY + 1; y < maxY; y += 1) {
      addDoorIfPresent(minX, y);
      addDoorIfPresent(maxX, y);
    }

    if (doors.length < 1) {
      return null;
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width,
      height,
      centerX: (minX + maxX) * 0.5 + 0.5,
      centerY: (minY + maxY) * 0.5 + 0.5,
      doors,
    };
  }

  findSettlementTileForNpc(npc, centerTileX, centerTileY, searchRadius = 5) {
    let best = null;

    for (let oy = -searchRadius; oy <= searchRadius; oy += 1) {
      for (let ox = -searchRadius; ox <= searchRadius; ox += 1) {
        const tileX = centerTileX + ox;
        const tileY = centerTileY + oy;
        const room = this.getConstructedRoomAt(tileX, tileY);

        if (!room) {
          continue;
        }

        if (!this.canSettleNpcAt(npc, tileX, tileY, { roomData: room })) {
          continue;
        }

        let nearestDoorDistanceSq = Number.POSITIVE_INFINITY;
        let nearestDoorTileX = null;
        let nearestDoorTileY = null;
        for (const door of room.doors) {
          const doorDx = door.tileX - tileX;
          const doorDy = door.tileY - tileY;
          const distSq = doorDx * doorDx + doorDy * doorDy;
          if (distSq < nearestDoorDistanceSq) {
            nearestDoorDistanceSq = distSq;
            nearestDoorTileX = door.tileX;
            nearestDoorTileY = door.tileY;
          }
        }

        if (!Number.isFinite(nearestDoorDistanceSq) || nearestDoorDistanceSq < 3) {
          continue;
        }

        const centerOffsetX = tileX + 0.5 - room.centerX;
        const centerOffsetY = tileY + 0.5 - room.centerY;
        const centerOffsetSq = centerOffsetX * centerOffsetX + centerOffsetY * centerOffsetY;
        const offsetScore = ox * ox + oy * oy;
        const score = Math.min(nearestDoorDistanceSq, 25) * 2.2 - centerOffsetSq * 6 - offsetScore * 0.4;

        if (!best || score > best.score) {
          best = {
            tileX,
            tileY,
            roomCenterX: room.centerX,
            roomCenterY: room.centerY,
            doorTileX: nearestDoorTileX,
            doorTileY: nearestDoorTileY,
            score,
          };
        }
      }
    }

    return best;
  }

  pickAlliedWanderTile(npc) {
    const homeTileX = npc.homeTileX ?? Math.floor(npc.x);
    const homeTileY = npc.homeTileY ?? Math.floor(npc.y);

    for (let attempt = 0; attempt < 56; attempt += 1) {
      const offsetX = randomIntInclusive(-3, 3);
      const offsetY = randomIntInclusive(-3, 3);
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const tileX = homeTileX + offsetX;
      const tileY = homeTileY + offsetY;
      if (!this.canSettleNpcAt(npc, tileX, tileY)) {
        continue;
      }

      if (npc.homeDoorTileX != null && npc.homeDoorTileY != null) {
        const doorDx = tileX - npc.homeDoorTileX;
        const doorDy = tileY - npc.homeDoorTileY;
        if (doorDx * doorDx + doorDy * doorDy < 3) {
          continue;
        }
      }

      return { tileX, tileY };
    }

    return { tileX: homeTileX, tileY: homeTileY };
  }


  clearNpcGatherTask(npc) {
    npc.gatherResourceId = null;
    npc.gatheredCount = 0;
    npc.gatherTargetTileX = null;
    npc.gatherTargetTileY = null;
    npc.gatherTargetObjectId = null;
    npc.gatherStandTileX = null;
    npc.gatherStandTileY = null;
    npc.gatherActionCooldown = 0;
  }

  moveNpcToward(npc, targetX, targetY, dt, speedScale = 1) {
    const dx = targetX - npc.x;
    const dy = targetY - npc.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) {
      return 0;
    }

    const step = Math.min(distance, npc.speed * dt * speedScale);
    const invDistance = distance > 0.0001 ? 1 / distance : 0;
    const moveX = dx * invDistance * step;
    const moveY = dy * invDistance * step;
    const prevX = npc.x;
    const prevY = npc.y;
    const nextX = npc.x + moveX;
    const nextY = npc.y + moveY;

    if (canOccupy(this.world, nextX, npc.y, npc.radius, this.state.npcs, npc.id)) {
      npc.x = nextX;
    }
    if (canOccupy(this.world, npc.x, nextY, npc.radius, this.state.npcs, npc.id)) {
      npc.y = nextY;
    }

    const moved = Math.hypot(npc.x - prevX, npc.y - prevY);
    if (moved > 0.0002) {
      npc.walkCycle = (npc.walkCycle ?? 0) + moved * 14;
      npc.walkAmount = Math.min(1, (npc.walkAmount ?? 0) + dt * 8);
    }
    return moved;
  }

  getSettledNpcRoom(npc) {
    if (!npc?.settled) {
      return null;
    }

    const tileX = npc.homeTileX ?? Math.floor(npc.x);
    const tileY = npc.homeTileY ?? Math.floor(npc.y);
    return this.getConstructedRoomAt(tileX, tileY);
  }

  findRoomSupportObjects(room) {
    const support = {
      chest: null,
      workbenches: [],
    };

    if (!room) {
      return support;
    }

    for (let y = room.minY + 1; y <= room.maxY - 1; y += 1) {
      for (let x = room.minX + 1; x <= room.maxX - 1; x += 1) {
        const object = this.world.getObject(x, y);
        if (!object) {
          continue;
        }

        if (object.type === ObjectType.SMALL_CHEST && !support.chest) {
          support.chest = object;
        }

        if (CRAFTING_OBJECT_TYPES.has(object.type)) {
          support.workbenches.push(object);
        }
      }
    }

    return support;
  }

  findRecipeForHeldAction(heldView) {
    if (!heldView) {
      return null;
    }

    for (const recipe of CRAFTING_RECIPES) {
      if (!recipe.stations.some((stationId) => !!STATION_OBJECT_TYPES[stationId])) {
        continue;
      }

      if (heldView.itemKind === ACTION_ITEM_KIND.RESOURCE && (recipe.outputs?.[heldView.itemId] ?? 0) > 0) {
        return recipe;
      }

      if (heldView.itemKind === ACTION_ITEM_KIND.TOOL && (recipe.toolOutputs?.[heldView.itemId] ?? 0) > 0) {
        return recipe;
      }
    }

    return null;
  }

  setAlliedCraftObjective(npc, recipe) {
    if (!npc || !recipe) {
      return false;
    }

    npc.desiredCraftRecipeId = recipe.id;
    npc.autoCraftCooldown = 0;
    this.hud.pushMessage(`${npcDisplayName(npc)} will craft ${recipe.name} when their room has a matching bench and stocked chest.`);
    return true;
  }

  setAlliedGatherObjective(npc, resourceId) {
    if (!ALLIED_GATHERABLE_RESOURCES.has(resourceId)) {
      return false;
    }

    const requiredTool = RESOURCE_TO_REQUIRED_TOOL[resourceId];
    if (requiredTool && !this.npcHasTool(npc, requiredTool)) {
      const toolLabel = TOOL_DEFINITIONS[requiredTool]?.label ?? requiredTool;
      this.hud.pushMessage(`${npcDisplayName(npc)} needs a ${toolLabel} to gather that resource.`);
      return false;
    }

    npc.gatherResourceId = resourceId;
    npc.gatheredCount = 0;
    npc.gatherTargetCount = ALLIED_GATHER_STACK_TARGET;
    npc.gatherTargetTileX = null;
    npc.gatherTargetTileY = null;
    npc.gatherTargetObjectId = null;
    npc.gatherStandTileX = null;
    npc.gatherStandTileY = null;
    npc.gatherActionCooldown = 0;
    npc.recovering = false;

    const label = RESOURCE_DEFINITIONS[resourceId]?.label ?? resourceId;
    this.hud.pushMessage(`${npcDisplayName(npc)} will gather ${label} until stack ${ALLIED_GATHER_STACK_TARGET} or heavy injury.`);
    return true;
  }

  pickGatherStandTile(targetTileX, targetTileY, npc, allowCenter = true) {
    const offsets = [];
    if (allowCenter) {
      offsets.push([0, 0]);
    }
    offsets.push([1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]);

    for (const [ox, oy] of offsets) {
      const tileX = targetTileX + ox;
      const tileY = targetTileY + oy;
      if (!this.world.inTileBounds(tileX, tileY)) {
        continue;
      }

      if (!this.world.isWalkableTile(tileX, tileY)) {
        continue;
      }

      const standX = tileX + 0.5;
      const standY = tileY + 0.5;
      if (!canOccupy(this.world, standX, standY, npc.radius, this.state.npcs, npc.id)) {
        continue;
      }

      return { tileX, tileY };
    }

    return null;
  }

  isValidGatherTarget(npc, resourceId) {
    if (!Number.isFinite(npc.gatherTargetTileX) || !Number.isFinite(npc.gatherTargetTileY)) {
      return false;
    }

    const tileX = npc.gatherTargetTileX;
    const tileY = npc.gatherTargetTileY;

    if (resourceId === ResourceId.STONE_BLOCK) {
      return (
        this.world.getTile(tileX, tileY) === TileType.WALL &&
        this.world.chunkTypeAtTile(tileX, tileY) === ChunkType.CAVERN
      );
    }

    const object = Number.isFinite(npc.gatherTargetObjectId)
      ? this.world.getObjectById(npc.gatherTargetObjectId)
      : this.world.getObject(tileX, tileY);
    if (!object || object.tileX !== tileX || object.tileY !== tileY) {
      return false;
    }

    if (resourceId === ResourceId.WOODY_ROOT) {
      return object.type === ObjectType.WOODY_ROOT;
    }
    if (resourceId === ResourceId.MUSHROOM) {
      return object.type === ObjectType.MUSHROOM;
    }
    if (
      resourceId === ResourceId.COPPER_ORE ||
      resourceId === ResourceId.ZINC_ORE ||
      resourceId === ResourceId.IRON_ORE
    ) {
      return object.type === ObjectType.ORE_NODE && (object.data?.resourceId ?? ResourceId.COPPER_ORE) === resourceId;
    }

    return false;
  }

  findNpcGatherTarget(npc, resourceId, radius = 22) {
    const centerTileX = Math.floor(npc.x);
    const centerTileY = Math.floor(npc.y);
    let best = null;

    const consider = (candidate) => {
      const dx = candidate.tileX + 0.5 - npc.x;
      const dy = candidate.tileY + 0.5 - npc.y;
      const distSq = dx * dx + dy * dy;
      if (!best || distSq < best.distSq) {
        best = {
          ...candidate,
          distSq,
        };
      }
    };

    if (resourceId === ResourceId.STONE_BLOCK) {
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const tileX = centerTileX + ox;
          const tileY = centerTileY + oy;
          if (!this.world.inTileBounds(tileX, tileY)) {
            continue;
          }

          if (this.world.getTile(tileX, tileY) !== TileType.WALL) {
            continue;
          }

          if (this.world.chunkTypeAtTile(tileX, tileY) !== ChunkType.CAVERN) {
            continue;
          }

          const stand = this.pickGatherStandTile(tileX, tileY, npc, false);
          if (!stand) {
            continue;
          }

          consider({
            kind: "block",
            tileX,
            tileY,
            objectId: null,
            standTileX: stand.tileX,
            standTileY: stand.tileY,
          });
        }
      }

      return best;
    }

    this.world.forEachObjectNear(centerTileX, centerTileY, radius, (object) => {
      let match = false;
      if (resourceId === ResourceId.WOODY_ROOT) {
        match = object.type === ObjectType.WOODY_ROOT;
      } else if (resourceId === ResourceId.MUSHROOM) {
        match = object.type === ObjectType.MUSHROOM;
      } else if (
        resourceId === ResourceId.COPPER_ORE ||
        resourceId === ResourceId.ZINC_ORE ||
        resourceId === ResourceId.IRON_ORE
      ) {
        match = object.type === ObjectType.ORE_NODE && (object.data?.resourceId ?? ResourceId.COPPER_ORE) === resourceId;
      }

      if (!match) {
        return;
      }

      const stand = this.pickGatherStandTile(object.tileX, object.tileY, npc, true);
      if (!stand) {
        return;
      }

      consider({
        kind: "object",
        tileX: object.tileX,
        tileY: object.tileY,
        objectId: object.id,
        standTileX: stand.tileX,
        standTileY: stand.tileY,
      });
    });

    return best;
  }

  tryHarvestNpcGatherTarget(npc) {
    const resourceId = npc.gatherResourceId;
    if (!resourceId || !this.isValidGatherTarget(npc, resourceId)) {
      return false;
    }

    const tileX = npc.gatherTargetTileX;
    const tileY = npc.gatherTargetTileY;

    if (resourceId === ResourceId.STONE_BLOCK) {
      this.world.setTile(tileX, tileY, TileType.FLOOR);
      this.addResource(ResourceId.STONE_BLOCK, 1, { trackCollection: true });
      return true;
    }

    const removed = this.world.removeObject(tileX, tileY);
    if (!removed) {
      return false;
    }

    this.addResource(resourceId, 1, { trackCollection: true });
    return true;
  }

  updateAlliedGatherTask(npc, dt) {
    if (!npc.gatherResourceId) {
      return false;
    }

    const requiredTool = RESOURCE_TO_REQUIRED_TOOL[npc.gatherResourceId];
    if (requiredTool && !this.npcHasTool(npc, requiredTool)) {
      const toolLabel = TOOL_DEFINITIONS[requiredTool]?.label ?? requiredTool;
      this.hud.pushMessage(`${npcDisplayName(npc)} stopped gathering: missing ${toolLabel}.`);
      this.clearNpcGatherTask(npc);
      return false;
    }

    if (npc.health <= npc.maxHealth * ALLIED_RETREAT_HEALTH_RATIO) {
      if (!npc.recovering) {
        this.hud.pushMessage(`${npcDisplayName(npc)} is hurt and returns home to recover.`);
      }
      npc.recovering = true;
      this.clearNpcGatherTask(npc);
      return false;
    }

    if ((npc.gatheredCount ?? 0) >= (npc.gatherTargetCount ?? ALLIED_GATHER_STACK_TARGET)) {
      const label = RESOURCE_DEFINITIONS[npc.gatherResourceId]?.label ?? npc.gatherResourceId;
      this.hud.pushMessage(`${npcDisplayName(npc)} gathered a stack of ${label}.`);
      npc.recovering = true;
      this.clearNpcGatherTask(npc);
      return false;
    }

    if (!this.isValidGatherTarget(npc, npc.gatherResourceId)) {
      const target = this.findNpcGatherTarget(npc, npc.gatherResourceId);
      if (!target) {
        const homeX = (npc.homeTileX ?? Math.floor(npc.x)) + 0.5;
        const homeY = (npc.homeTileY ?? Math.floor(npc.y)) + 0.5;
        this.moveNpcToward(npc, homeX, homeY, dt, 0.75);
        return true;
      }

      npc.gatherTargetTileX = target.tileX;
      npc.gatherTargetTileY = target.tileY;
      npc.gatherTargetObjectId = target.objectId;
      npc.gatherStandTileX = target.standTileX;
      npc.gatherStandTileY = target.standTileY;
    }

    const standX = (npc.gatherStandTileX ?? npc.gatherTargetTileX) + 0.5;
    const standY = (npc.gatherStandTileY ?? npc.gatherTargetTileY) + 0.5;
    const standDistance = Math.hypot(standX - npc.x, standY - npc.y);

    if (standDistance > 0.58) {
      this.moveNpcToward(npc, standX, standY, dt, 1.05);
      return true;
    }

    if ((npc.gatherActionCooldown ?? 0) > 0) {
      return true;
    }

    const harvested = this.tryHarvestNpcGatherTarget(npc);
    npc.gatherActionCooldown = 0.55;
    if (!harvested) {
      npc.gatherTargetTileX = null;
      npc.gatherTargetTileY = null;
      npc.gatherTargetObjectId = null;
      npc.gatherStandTileX = null;
      npc.gatherStandTileY = null;
      return true;
    }

    npc.gatheredCount = (npc.gatheredCount ?? 0) + 1;
    npc.gatherTargetTileX = null;
    npc.gatherTargetTileY = null;
    npc.gatherTargetObjectId = null;
    npc.gatherStandTileX = null;
    npc.gatherStandTileY = null;

    if ((npc.gatheredCount ?? 0) >= (npc.gatherTargetCount ?? ALLIED_GATHER_STACK_TARGET)) {
      const label = RESOURCE_DEFINITIONS[npc.gatherResourceId]?.label ?? npc.gatherResourceId;
      this.hud.pushMessage(`${npcDisplayName(npc)} completed gathering ${label}.`);
      npc.recovering = true;
      this.clearNpcGatherTask(npc);
      return false;
    }

    return true;
  }

  tryAlliedAutoCraft(npc) {
    if (!npc.desiredCraftRecipeId) {
      return false;
    }

    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === npc.desiredCraftRecipeId);
    if (!recipe) {
      npc.desiredCraftRecipeId = null;
      return false;
    }

    const room = this.getSettledNpcRoom(npc);
    const support = this.findRoomSupportObjects(room);
    if (!support.chest || support.workbenches.length === 0) {
      return false;
    }

    const bench = support.workbenches.find((object) => {
      const stationId = stationIdForObjectType(object.type);
      return !!stationId && recipe.stations.includes(stationId);
    });
    if (!bench) {
      return false;
    }

    const chestSlots = support.chest.data?.slots;
    if (!Array.isArray(chestSlots)) {
      return false;
    }

    if (!hasRecipeInputs(chestSlots, recipe)) {
      return false;
    }

    for (const [toolId, amount] of Object.entries(recipe.toolOutputs ?? {})) {
      if (amount <= 0) {
        continue;
      }

      const playerHas = this.playerOwnsTool(toolId);
      const npcHas = this.npcHasTool(npc, toolId);
      if (playerHas && npcHas) {
        return false;
      }
    }

    const resourceOutputCount = Object.values(recipe.outputs ?? {}).reduce((sum, amount) => sum + amount, 0);
    if (resourceOutputCount > 0) {
      const inputCount = Object.values(recipe.inputs ?? {}).reduce((sum, amount) => sum + amount, 0);
      const freeAfterConsume = countEmptySlots(chestSlots) + inputCount;
      if (freeAfterConsume < resourceOutputCount) {
        return false;
      }
    }

    consumeSlotInputs(chestSlots, recipe.inputs);

    for (const [resourceId, amount] of Object.entries(recipe.outputs ?? {})) {
      addResourceToSlots(chestSlots, resourceId, amount);
    }

    for (const [toolId, amount] of Object.entries(recipe.toolOutputs ?? {})) {
      if (amount <= 0) {
        continue;
      }

      if (!this.playerOwnsTool(toolId)) {
        this.addPlayerTool(toolId);
      } else if (!this.npcHasTool(npc, toolId)) {
        npc.toolInventory.push(toolId);
      }
    }

    this.hud.pushMessage(`${npcDisplayName(npc)} crafted ${recipe.name}.`);
    return true;
  }

  updateAlliedAutoCraft(npc, dt) {
    if (!npc.desiredCraftRecipeId || npc.gatherResourceId) {
      return;
    }

    npc.autoCraftCooldown = Math.max(0, (npc.autoCraftCooldown ?? 0) - dt);
    if (npc.autoCraftCooldown > 0) {
      return;
    }

    this.tryAlliedAutoCraft(npc);
    npc.autoCraftCooldown = ALLIED_AUTOCRAFT_INTERVAL + Math.random() * 1.8;
  }

  initializeGoblinSpawnPoints() {
    const worldChunks = Math.floor(this.world.worldTiles / this.world.chunkTiles);
    const halfChunks = Math.floor(worldChunks * 0.5);
    const visited = new Set();
    const regions = [];
    const keyOf = (chunkX, chunkY) => chunkX + "," + chunkY;
    const cardinal = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const neighborhood = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (let chunkY = -halfChunks; chunkY < worldChunks - halfChunks; chunkY += 1) {
      for (let chunkX = -halfChunks; chunkX < worldChunks - halfChunks; chunkX += 1) {
        if (this.world.chunkTypeAtChunkCoords(chunkX, chunkY) !== ChunkType.DUNGEON) {
          continue;
        }

        const chunkKey = keyOf(chunkX, chunkY);
        if (visited.has(chunkKey)) {
          continue;
        }

        const queue = [{ x: chunkX, y: chunkY }];
        const regionChunks = [];
        visited.add(chunkKey);

        while (queue.length) {
          const current = queue.shift();
          regionChunks.push(current);

          for (const [ox, oy] of cardinal) {
            const nx = current.x + ox;
            const ny = current.y + oy;
            const neighborKey = keyOf(nx, ny);
            if (visited.has(neighborKey)) {
              continue;
            }

            if (this.world.chunkTypeAtChunkCoords(nx, ny) !== ChunkType.DUNGEON) {
              continue;
            }

            visited.add(neighborKey);
            queue.push({ x: nx, y: ny });
          }
        }

        const perimeterMap = new Map();
        for (const chunk of regionChunks) {
          for (const [ox, oy] of neighborhood) {
            const nx = chunk.x + ox;
            const ny = chunk.y + oy;
            if (this.world.chunkTypeAtChunkCoords(nx, ny) !== ChunkType.CAVERN) {
              continue;
            }

            const perimeterKey = keyOf(nx, ny);
            if (!perimeterMap.has(perimeterKey)) {
              perimeterMap.set(perimeterKey, { x: nx, y: ny });
            }
          }
        }

        if (!perimeterMap.size) {
          continue;
        }

        regions.push({
          id: regions.length + 1,
          chunks: regionChunks,
          perimeterChunks: Array.from(perimeterMap.values()),
        });
      }
    }

    const points = [];
    let nextPointId = 1;
    const pointsRange = GOBLIN_SPAWN_POINTS_MAX_PER_REGION - GOBLIN_SPAWN_POINTS_MIN_PER_REGION + 1;

    for (const region of regions) {
      const roll = random01(WORLD_SEED + 3301, region.id, 19);
      const pointCount = GOBLIN_SPAWN_POINTS_MIN_PER_REGION + Math.floor(roll * pointsRange);
      for (let i = 0; i < pointCount; i += 1) {
        const tile = this.pickGoblinSpawnTileForRegion(region, region.id * 97 + i * 13);
        if (!tile) {
          continue;
        }

        points.push({
          id: nextPointId,
          source: "dungeon-perimeter",
          regionId: region.id,
          tileX: tile.tileX,
          tileY: tile.tileY,
          cooldown: 0,
          linkedNpcId: null,
        });
        nextPointId += 1;
      }
    }

    const tunnelRange = GOBLIN_TUNNEL_SPAWN_POINTS_MAX - GOBLIN_TUNNEL_SPAWN_POINTS_MIN + 1;
    const tunnelRoll = random01(WORLD_SEED + 3433, 1, 53);
    const tunnelPointCount = GOBLIN_TUNNEL_SPAWN_POINTS_MIN + Math.floor(tunnelRoll * tunnelRange);
    for (let i = 0; i < tunnelPointCount; i += 1) {
      const tile = this.pickGoblinTunnelTile(607 + i * 29, points);
      if (!tile) {
        continue;
      }

      points.push({
        id: nextPointId,
        source: "tunnel",
        regionId: null,
        tileX: tile.tileX,
        tileY: tile.tileY,
        cooldown: 0,
        linkedNpcId: null,
      });
      nextPointId += 1;
    }

    return { regions, points };
  }

  pickGoblinSpawnTileForRegion(region, salt = 1) {
    if (!region?.perimeterChunks?.length) {
      return null;
    }

    const chunkTiles = this.world.chunkTiles;
    const worldChunks = Math.floor(this.world.worldTiles / chunkTiles);
    const halfChunks = Math.floor(worldChunks * 0.5);

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const chunkIndex =
        Math.floor(random01(WORLD_SEED + 3349, salt + attempt * 11, 7) * region.perimeterChunks.length)
        % region.perimeterChunks.length;
      const chunk = region.perimeterChunks[chunkIndex];
      const startX = (chunk.x + halfChunks) * chunkTiles;
      const startY = (chunk.y + halfChunks) * chunkTiles;

      for (let tileAttempt = 0; tileAttempt < 24; tileAttempt += 1) {
        const rx = Math.floor(random01(WORLD_SEED + 3371, salt + attempt * 17, tileAttempt + 5) * chunkTiles);
        const ry = Math.floor(random01(WORLD_SEED + 3389, salt + attempt * 23, tileAttempt + 9) * chunkTiles);
        const tileX = startX + rx;
        const tileY = startY + ry;

        if (!this.world.inTileBounds(tileX, tileY)) {
          continue;
        }

        if (!this.isGoblinTunnelTile(tileX, tileY)) {
          continue;
        }

        const pointChunkX = this.world.tileToChunkCoord(tileX);
        const pointChunkY = this.world.tileToChunkCoord(tileY);
        let nearDungeon = false;
        for (let oy = -1; oy <= 1 && !nearDungeon; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (this.world.chunkTypeAtChunkCoords(pointChunkX + ox, pointChunkY + oy) === ChunkType.DUNGEON) {
              nearDungeon = true;
              break;
            }
          }
        }

        if (!nearDungeon) {
          continue;
        }

        return { tileX, tileY };
      }
    }

    return null;
  }

  isGoblinTunnelTile(tileX, tileY) {
    if (!this.world.inTileBounds(tileX, tileY)) {
      return false;
    }

    if (this.world.chunkTypeAtTile(tileX, tileY) !== ChunkType.CAVERN) {
      return false;
    }

    if (!this.world.isWalkableTile(tileX, tileY)) {
      return false;
    }

    if (this.world.getObject(tileX, tileY)) {
      return false;
    }

    let floorCount = 0;
    for (let oy = -2; oy <= 2; oy += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        if (this.world.getTile(tileX + ox, tileY + oy) === TileType.FLOOR) {
          floorCount += 1;
        }
      }
    }

    if (floorCount < 7 || floorCount > 18) {
      return false;
    }

    let cardinalOpen = 0;
    if (this.world.getTile(tileX + 1, tileY) === TileType.FLOOR) {
      cardinalOpen += 1;
    }
    if (this.world.getTile(tileX - 1, tileY) === TileType.FLOOR) {
      cardinalOpen += 1;
    }
    if (this.world.getTile(tileX, tileY + 1) === TileType.FLOOR) {
      cardinalOpen += 1;
    }
    if (this.world.getTile(tileX, tileY - 1) === TileType.FLOOR) {
      cardinalOpen += 1;
    }

    return cardinalOpen >= 2;
  }

  pickGoblinTunnelTile(salt = 1, existingPoints = null) {
    const points = existingPoints ?? this.goblinSpawnPoints ?? [];

    for (let attempt = 0; attempt < 2400; attempt += 1) {
      const tileX = Math.floor(random01(WORLD_SEED + 3467, salt, attempt + 17) * this.world.worldTiles);
      const tileY = Math.floor(random01(WORLD_SEED + 3491, salt, attempt + 29) * this.world.worldTiles);

      if (!this.isGoblinTunnelTile(tileX, tileY)) {
        continue;
      }

      let tooClose = false;
      for (const point of points) {
        const dx = point.tileX - tileX;
        const dy = point.tileY - tileY;
        if (dx * dx + dy * dy < 36) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }

      return { tileX, tileY };
    }

    return null;
  }

  randomGoblinRespawnCooldown() {
    const roll = random01(WORLD_SEED + 3449, this.spawnState.salt, 67);
    this.spawnState.salt += 1;
    return GOBLIN_RESPAWN_COOLDOWN_MIN + roll * (GOBLIN_RESPAWN_COOLDOWN_MAX - GOBLIN_RESPAWN_COOLDOWN_MIN);
  }

  releaseGoblinSpawnPoint(point) {
    if (!point) {
      return;
    }

    point.linkedNpcId = null;

    let relocated = null;
    if (point.source === "dungeon-perimeter") {
      const region = this.goblinSpawnRegionById.get(point.regionId);
      if (region) {
        relocated = this.pickGoblinSpawnTileForRegion(region, point.id * 71 + this.spawnState.salt);
      }
    } else {
      relocated = this.pickGoblinTunnelTile(point.id * 83 + this.spawnState.salt);
    }

    if (relocated) {
      point.tileX = relocated.tileX;
      point.tileY = relocated.tileY;
    }

    point.cooldown = this.randomGoblinRespawnCooldown();
  }

  trySpawnGoblinFromSpawnPoint(point) {
    if (!point) {
      return false;
    }

    if (this.world.chunkTypeAtTile(point.tileX, point.tileY) !== ChunkType.CAVERN) {
      this.releaseGoblinSpawnPoint(point);
      return false;
    }

    if (!this.world.isWalkableTile(point.tileX, point.tileY) || this.world.getObject(point.tileX, point.tileY)) {
      this.releaseGoblinSpawnPoint(point);
      return false;
    }

    const level = npcLevelForTile(point.tileX, point.tileY, ChunkType.CAVERN);
    const profile = buildNpcProfile("goblin", level);
    const spawnX = point.tileX + 0.5;
    const spawnY = point.tileY + 0.5;
    if (!canOccupy(this.world, spawnX, spawnY, profile.radius, this.state.npcs)) {
      return false;
    }

    const npc = createNpcEntity(
      this.nextNpcId,
      "goblin",
      spawnX,
      spawnY,
      profile,
      level,
      WORLD_SEED + 3607 + this.nextNpcId,
      WORLD_SEED + 3661 + this.nextNpcId,
    );

    npc.goblinSpawnPointId = point.id;
    this.nextNpcId += 1;
    this.state.npcs.push(npc);
    point.linkedNpcId = npc.id;
    point.cooldown = 0;
    return true;
  }

  updateGoblinSpawnPoints(dt) {
    if (!this.goblinSpawnPoints?.length) {
      return;
    }

    const npcById = new Map(this.state.npcs.map((npc) => [npc.id, npc]));
    const playerX = this.state.player.x;
    const playerY = this.state.player.y;

    for (const point of this.goblinSpawnPoints) {
      if (point.linkedNpcId != null) {
        const linkedNpc = npcById.get(point.linkedNpcId);
        const stillLinked =
          linkedNpc &&
          linkedNpc.alive &&
          linkedNpc.kind === "goblin" &&
          linkedNpc.category !== "allied" &&
          linkedNpc.goblinSpawnPointId === point.id;

        if (!stillLinked) {
          this.releaseGoblinSpawnPoint(point);
        }
        continue;
      }

      if (point.cooldown > 0) {
        point.cooldown = Math.max(0, point.cooldown - dt);
        if (point.cooldown > 0) {
          continue;
        }
      }

      const dx = point.tileX + 0.5 - playerX;
      const dy = point.tileY + 0.5 - playerY;
      if (dx * dx + dy * dy > GOBLIN_SPAWN_ACTIVATION_RADIUS * GOBLIN_SPAWN_ACTIVATION_RADIUS) {
        continue;
      }

      this.trySpawnGoblinFromSpawnPoint(point);
    }
  }

  countNearbyNpcCategories(centerX, centerY, radius, requiredChunkType = null) {
    const counts = {
      hostile: 0,
      agnostic: 0,
      allied: 0,
    };

    const radiusSq = radius * radius;
    for (const npc of this.state.npcs) {
      if (!npc.alive) {
        continue;
      }

      const dx = npc.x - centerX;
      const dy = npc.y - centerY;
      if (dx * dx + dy * dy > radiusSq) {
        continue;
      }

      if (requiredChunkType) {
        const npcChunk = this.world.chunkTypeAtTile(Math.floor(npc.x), Math.floor(npc.y));
        if (npcChunk !== requiredChunkType) {
          continue;
        }
      }

      if (npc.category === "allied") {
        counts.allied += 1;
      } else if (npc.category === "agnostic" && !npc.provoked) {
        counts.agnostic += 1;
      } else {
        counts.hostile += 1;
      }
    }

    return counts;
  }

  countNearbyNpcsByKind(centerX, centerY, radius, kind, requiredChunkType = null) {
    const radiusSq = radius * radius;
    let count = 0;

    for (const npc of this.state.npcs) {
      if (!npc.alive || npc.kind !== kind) {
        continue;
      }

      const dx = npc.x - centerX;
      const dy = npc.y - centerY;
      if (dx * dx + dy * dy > radiusSq) {
        continue;
      }

      if (requiredChunkType) {
        const npcChunk = this.world.chunkTypeAtTile(Math.floor(npc.x), Math.floor(npc.y));
        if (npcChunk !== requiredChunkType) {
          continue;
        }
      }

      count += 1;
    }

    return count;
  }

  countNpcCategoriesByChunk(requiredChunkType = null) {
    const counts = {
      hostile: 0,
      agnostic: 0,
      allied: 0,
    };

    for (const npc of this.state.npcs) {
      if (!npc.alive) {
        continue;
      }

      if (requiredChunkType) {
        const npcChunk = this.world.chunkTypeAtTile(Math.floor(npc.x), Math.floor(npc.y));
        if (npcChunk !== requiredChunkType) {
          continue;
        }
      }

      if (npc.category === "allied") {
        counts.allied += 1;
      } else if (npc.category === "agnostic" && !npc.provoked) {
        counts.agnostic += 1;
      } else {
        counts.hostile += 1;
      }
    }

    return counts;
  }

  updateNpcSpawning(dt) {
    this.spawnState.hostileTimer -= dt;
    this.spawnState.ratTimer -= dt;

    const player = this.state.player;
    const playerTileX = Math.floor(player.x);
    const playerTileY = Math.floor(player.y);
    const playerChunkType = this.world.chunkTypeAtTile(playerTileX, playerTileY);

    if (playerChunkType === ChunkType.DUNGEON) {
      const nearbyDungeon = this.countNearbyNpcCategories(
        player.x,
        player.y,
        NPC_SPAWN_COUNT_RADIUS,
        ChunkType.DUNGEON,
      );

      if (this.spawnState.hostileTimer <= 0) {
        this.spawnState.hostileTimer = NPC_HOSTILE_SPAWN_INTERVAL;
        if (
          nearbyDungeon.hostile <= NPC_HOSTILE_START_THRESHOLD
          && nearbyDungeon.hostile < NPC_HOSTILE_TARGET_DUNGEON
        ) {
          this.trySpawnNpcNearPlayer("golem", ChunkType.DUNGEON, 108);
        }
      }
    }

    if (this.spawnState.ratTimer <= 0) {
      this.spawnState.ratTimer = NPC_RAT_SPAWN_INTERVAL;
      const inDungeon = playerChunkType === ChunkType.DUNGEON;
      const inCavern = playerChunkType === ChunkType.CAVERN;
      if (inDungeon || inCavern) {
        const requiredChunkType = inDungeon ? ChunkType.DUNGEON : ChunkType.CAVERN;
        const ratTarget = inDungeon ? NPC_RAT_TARGET_DUNGEON : NPC_RAT_TARGET_CAVERN;
        const nearbyRats = this.countNearbyNpcsByKind(
          player.x,
          player.y,
          NPC_SPAWN_COUNT_RADIUS,
          "rat",
          requiredChunkType,
        );

        if (nearbyRats <= NPC_RAT_START_THRESHOLD && nearbyRats < ratTarget) {
          this.trySpawnNpcNearPlayer("rat", requiredChunkType, inDungeon ? 92 : 82);
        }
      }
    }
  }

  trySpawnNpcNearPlayer(kind, requiredChunkType, attempts = 72) {
    const player = this.state.player;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const salt = this.spawnState.salt + attempt * 17;
      const angle = random01(WORLD_SEED + 2081, salt, 17) * Math.PI * 2;
      const distance =
        NPC_SPAWN_MIN_PLAYER_DISTANCE
        + random01(WORLD_SEED + 2099, salt, 23) * (NPC_SPAWN_RADIUS - NPC_SPAWN_MIN_PLAYER_DISTANCE);

      const sampleX = player.x + Math.cos(angle) * distance;
      const sampleY = player.y + Math.sin(angle) * distance;
      const tileX = Math.floor(sampleX);
      const tileY = Math.floor(sampleY);

      if (!this.world.inTileBounds(tileX, tileY)) {
        continue;
      }

      if (this.world.chunkTypeAtTile(tileX, tileY) !== requiredChunkType) {
        continue;
      }

      if (!this.world.isWalkableTile(tileX, tileY)) {
        continue;
      }

      const level = npcLevelForTile(tileX, tileY, requiredChunkType);
      const profile = buildNpcProfile(kind, level);
      const spawnX = tileX + 0.5;
      const spawnY = tileY + 0.5;
      if (!canOccupy(this.world, spawnX, spawnY, profile.radius, this.state.npcs)) {
        continue;
      }

      const npc = createNpcEntity(
        this.nextNpcId,
        kind,
        spawnX,
        spawnY,
        profile,
        level,
        WORLD_SEED + 2203 + this.nextNpcId,
        WORLD_SEED + 2251 + this.nextNpcId,
      );
      this.nextNpcId += 1;
      this.spawnState.salt += 1;
      this.state.npcs.push(npc);

      if (kind === "ally") {
        this.hud.pushMessage("An allied traveler joins you.");
      }

      return true;
    }

    this.spawnState.salt += attempts;
    return false;
  }

  updateDamagePopups(dt) {
    if (!this.state.combat.damagePopups.length) {
      return;
    }

    for (const popup of this.state.combat.damagePopups) {
      popup.timer = Math.max(0, popup.timer - dt);
      const anchorNpc = this.state.npcs.find((npc) => npc.id === popup.npcId);
      if (anchorNpc) {
        popup.x = anchorNpc.x;
        popup.y = anchorNpc.y;
      }
    }

    this.state.combat.damagePopups = this.state.combat.damagePopups.filter((popup) => popup.timer > 0);
  }

  updateActiveHealing(dt) {
    const player = this.state.player;
    const activeHeals = player.activeHeals ?? [];
    if (!activeHeals.length) {
      return;
    }

    for (const effect of activeHeals) {
      if ((effect.remainingTime ?? 0) <= 0 || (effect.remainingHeal ?? 0) <= 0) {
        continue;
      }

      const stepTime = Math.min(dt, effect.remainingTime);
      const scheduledHeal = (effect.rate ?? 0) * stepTime;
      effect.remainingTime = Math.max(0, effect.remainingTime - stepTime);
      effect.remainingHeal = Math.max(0, effect.remainingHeal - scheduledHeal);

      if (scheduledHeal > 0 && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + scheduledHeal);
      }
    }

    player.activeHeals = activeHeals.filter((effect) => effect.remainingTime > 0 && effect.remainingHeal > 0);
  }

  spawnDamagePopup(npc, amount) {
    if (!npc || amount <= 0) {
      return;
    }

    const popup = {
      id: this.state.combat.nextDamagePopupId,
      npcId: npc.id,
      value: Math.round(amount),
      x: npc.x,
      y: npc.y,
      zOffset: 0.92,
      timer: DAMAGE_POPUP_DURATION,
      duration: DAMAGE_POPUP_DURATION,
      color: npc.alive ? "#ffe08c" : "#ffc7a5",
    };

    this.state.combat.nextDamagePopupId += 1;
    this.state.combat.damagePopups.push(popup);
  }
  handlePlayerDefeat() {
    this.state.player.health = this.state.player.maxHealth;
    this.state.player.hurtTimer = 0;
    this.state.player.hurtFlash = 0;
    this.state.player.stamina = this.state.player.maxStamina;
    this.state.player.mana = this.state.player.maxMana;
    this.state.player.staminaRegenLockout = 0;
    this.state.player.activeHeals = [];
    this.state.player.x = ORIGIN_TILE + 0.5;
    this.state.player.y = ORIGIN_TILE + 0.5;
    this.state.combat.damagePopups = [];
    this.hud.pushMessage("You were defeated and returned to the origin cavern pocket.");
  }

  windowsOpen() {
    return this.state.ui.playerWindowOpen || this.state.ui.hammerWindowOpen || this.state.ui.objectWindowOpen || this.state.ui.questJournalOpen;
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.viewCanvas) {
      document.exitPointerLock();
    }
  }

    getToolbarAssignment(index) {
    if (index < 0 || index >= this.state.toolbarSlots.length) {
      return null;
    }

    return this.state.toolbarSlots[index] ?? null;
  }

  getHotbarAssignment(index, hotbarIndex = this.state.activeHotbarIndex) {
    const hotbar = this.state.hotbars[hotbarIndex];
    if (!hotbar || index < 0 || index >= hotbar.length) {
      return null;
    }

    return hotbar[index] ?? null;
  }

  getSelectedToolbarAssignment() {
    return this.getToolbarAssignment(this.state.selectedSlot);
  }


  playerOwnsTool(toolId) {
    return !!this.state.ownedTools?.[toolId];
  }

  addPlayerTool(toolId) {
    if (!TOOL_DEFINITIONS[toolId]) {
      return false;
    }

    if (!this.state.ownedTools) {
      this.state.ownedTools = {};
    }

    const alreadyOwned = !!this.state.ownedTools[toolId];
    this.state.ownedTools[toolId] = true;
    return !alreadyOwned;
  }

  removeToolFromLoadouts(toolId) {
    for (let i = 0; i < this.state.toolbarSlots.length; i += 1) {
      const slot = this.state.toolbarSlots[i];
      if (slot?.kind === ACTION_ITEM_KIND.TOOL && slot.id === toolId) {
        this.state.toolbarSlots[i] = null;
      }
    }

    for (const hotbar of this.state.hotbars) {
      for (let i = 0; i < hotbar.length; i += 1) {
        const slot = hotbar[i];
        if (slot?.kind === ACTION_ITEM_KIND.TOOL && slot.id === toolId) {
          hotbar[i] = null;
        }
      }
    }

    if (this.state.selectedTool === toolId) {
      const fallback = Object.values(ToolId).find((id) => this.playerOwnsTool(id));
      this.state.selectedTool = fallback ?? ToolId.KNIFE;
    }

    this.selectToolbarSlot(this.state.selectedSlot, false);
  }

  transferToolToNpc(npc, toolId) {
    if (!npc || !TOOL_DEFINITIONS[toolId]) {
      return false;
    }

    if (!this.playerOwnsTool(toolId)) {
      this.hud.pushMessage(`You do not currently own ${TOOL_DEFINITIONS[toolId].label}.`);
      return false;
    }

    npc.toolInventory = Array.isArray(npc.toolInventory) ? npc.toolInventory : [];
    if (npc.toolInventory.includes(toolId)) {
      this.hud.pushMessage(`${npcDisplayName(npc)} already has a ${TOOL_DEFINITIONS[toolId].label}.`);
      return false;
    }

    this.state.ownedTools[toolId] = false;
    this.removeToolFromLoadouts(toolId);
    npc.toolInventory.push(toolId);
    this.hud.pushMessage(`Gave ${TOOL_DEFINITIONS[toolId].label} to ${npcDisplayName(npc)}.`);
    return true;
  }

  npcHasTool(npc, toolId) {
    return Array.isArray(npc?.toolInventory) && npc.toolInventory.includes(toolId);
  }

  getHeldActionView() {
    return this.getActionItemView(this.getSelectedToolbarAssignment());
  }

  getResourceActionType(resourceId) {
    if (CONSUMABLE_RESOURCE_IDS.has(resourceId)) {
      return "consumable";
    }

    if (PLACEABLE_RESOURCE_TO_BUILD[resourceId]) {
      return "placeable";
    }

    return "resource";
  }

  getActionItemView(item) {
    const normalized = normalizeLoadoutItem(item);
    if (!normalized) {
      return null;
    }

    if (normalized.kind === ACTION_ITEM_KIND.TOOL) {
      const toolDef = TOOL_DEFINITIONS[normalized.id];
      if (!toolDef || !this.playerOwnsTool(normalized.id)) {
        return null;
      }

      return {
        itemKind: ACTION_ITEM_KIND.TOOL,
        itemId: normalized.id,
        icon: toolDef.icon,
        name: toolDef.label,
        className: toolDef.className,
        actionType: "tool",
      };
    }

    const resourceDef = RESOURCE_DEFINITIONS[normalized.id];
    if (!resourceDef) {
      return null;
    }

    return {
      itemKind: ACTION_ITEM_KIND.RESOURCE,
      itemId: normalized.id,
      icon: resourceDef.icon,
      name: resourceDef.label,
      className: resourceDef.className,
      actionType: this.getResourceActionType(normalized.id),
    };
  }

  getBuildIdForResource(resourceId) {
    return PLACEABLE_RESOURCE_TO_BUILD[resourceId] ?? null;
  }

  getSwingStaminaCost(toolId) {
    return TOOL_SWING_STAMINA_COST[toolId] ?? 0;
  }

  canStartToolSwing(toolId) {
    if (toolId === ToolId.KNIFE && this.state.combat.attackCooldown > 0) {
      return false;
    }
    return true;
  }

  consumeSwingStamina(toolId) {
    const cost = this.getSwingStaminaCost(toolId);
    if (cost <= 0) {
      return true;
    }

    const player = this.state.player;
    if (player.stamina < cost) {
      return false;
    }

    player.stamina = Math.max(0, player.stamina - cost);
    player.staminaRegenLockout = STAMINA_REGEN_DELAY;
    return true;
  }

  performToolPrimary(toolId) {
    if (!this.canStartToolSwing(toolId)) {
      return false;
    }

    if (!this.consumeSwingStamina(toolId)) {
      this.hud.pushMessage("Too exhausted to swing. Recover stamina.");
      return false;
    }

    this.state.selectedTool = toolId;
    this.state.viewModel.swing = 1;
    if (toolId === ToolId.KNIFE) {
      this.performKnifePrimary();
    } else if (toolId === ToolId.PICKAXE) {
      this.performPickaxePrimary();
    } else if (toolId === ToolId.HAMMER) {
      this.performHammerPrimary();
    }

    return true;
  }

  consumeToolbarConsumable(resourceId, itemName) {
    const available = this.state.resources[resourceId] ?? 0;
    if (available <= 0) {
      this.hud.pushMessage(`No ${itemName.toLowerCase()} available.`);
      return false;
    }

    this.state.resources[resourceId] = available - 1;

    if (resourceId === ResourceId.SIMPLE_STEW) {
      this.state.player.activeHeals.push({
        effectId: "simple-stew-regen",
        type: "heal",
        icon: "SW",
        label: "Stew Regen",
        remainingHeal: SIMPLE_STEW_HEAL_TOTAL,
        remainingTime: SIMPLE_STEW_HEAL_DURATION,
        totalTime: SIMPLE_STEW_HEAL_DURATION,
        rate: SIMPLE_STEW_HEAL_TOTAL / SIMPLE_STEW_HEAL_DURATION,
      });
      this.hud.pushMessage("Consumed Simple Stew (+20 HP over 30s).");
      return true;
    }

    const fallbackLabel = RESOURCE_DEFINITIONS[resourceId]?.label ?? "item";
    this.hud.pushMessage(`Consumed ${fallbackLabel}.`);
    return true;
  }

  performBuildPlacement(buildId) {
    const placement = targetTile(this.state.player);
    const tile = this.world.getTile(placement.tx, placement.ty);
    const chunkType = this.world.chunkTypeAtTile(placement.tx, placement.ty);
    const object = this.world.getObject(placement.tx, placement.ty);

    if (chunkType !== ChunkType.CAVERN) {
      this.hud.pushMessage("Dungeon chunks are locked. Construction denied.");
      return false;
    }

    const buildDefinition = BUILD_DEFINITIONS[buildId];
    if (!buildDefinition) {
      this.hud.pushMessage("No build target selected.");
      return false;
    }

    if (!this.hasBuildCosts(buildDefinition.costs)) {
      this.hud.pushMessage(`Need ${resourceString(buildDefinition.costs)} to build ${buildDefinition.name}.`);
      return false;
    }

    if (buildId === BuildId.STONE_BLOCK) {
      if (tile !== TileType.FLOOR || object) {
        this.hud.pushMessage("Need empty cavern floor to place a raw stone block.");
        return false;
      }

      const playerTileX = Math.floor(this.state.player.x);
      const playerTileY = Math.floor(this.state.player.y);
      if (playerTileX === placement.tx && playerTileY === placement.ty) {
        this.hud.pushMessage("Cannot place a block where you stand.");
        return false;
      }

      this.world.setTile(placement.tx, placement.ty, TileType.WALL);
      this.consumeBuildCosts(buildDefinition.costs);
      this.state.selectedBuild = buildId;
      this.hud.pushMessage("Placed raw stone block.");
      return true;
    }

    if (tile !== TileType.FLOOR || object) {
      this.hud.pushMessage("Need empty cavern floor for this build object.");
      return false;
    }

    const buildObjectType = this.buildObjectType(buildId);
    if (!buildObjectType) {
      this.hud.pushMessage("Selected build target is not placeable.");
      return false;
    }

    const placed = this.world.placeObject(placement.tx, placement.ty, buildObjectType, this.buildObjectData(buildId));

    if (!placed) {
      this.hud.pushMessage("Could not place build object at that location.");
      return false;
    }

    this.consumeBuildCosts(buildDefinition.costs);
    this.state.selectedBuild = buildId;
    this.hud.pushMessage(`Placed ${buildDefinition.name}.`);
    return true;
  }

  activateActionItem(item, options = {}) {
    const view = this.getActionItemView(item);
    const source = options.source ?? "toolbar";
    const activateTool = options.activateTool ?? false;

    if (!view) {
      if (options.announceEmpty !== false) {
        const label = source === "hotbar" ? "Hotbar slot" : "Toolbar slot";
        this.hud.pushMessage(`${label} is empty.`);
      }
      return false;
    }

    if (view.actionType === "tool") {
      this.state.selectedTool = view.itemId;
      if (view.itemId !== ToolId.HAMMER) {
        this.state.ui.hammerWindowOpen = false;
      }

      if (activateTool) {
        return this.performToolPrimary(view.itemId);
      }

      this.hud.pushMessage(`Equipped ${view.name}.`);
      return true;
    }

    if (view.actionType === "consumable") {
      return this.consumeToolbarConsumable(view.itemId, view.name);
    }

    if (view.actionType === "placeable") {
      const buildId = this.getBuildIdForResource(view.itemId);
      if (!buildId) {
        this.hud.pushMessage(`${view.name} has no placement mapping.`);
        return false;
      }

      return this.performBuildPlacement(buildId);
    }

    this.hud.pushMessage(`${view.name} cannot be activated directly.`);
    return false;
  }

  activateHotbarSlot(index) {
    const item = this.getHotbarAssignment(index);
    const view = this.getActionItemView(item);
    if (!view) {
      this.hud.pushMessage(`Hotbar slot ${index + 1} is empty.`);
      return;
    }

    if (view.actionType === "tool") {
      const matchingToolbarIndex = this.state.toolbarSlots.findIndex((slot) => loadoutItemsEqual(slot, item));
      if (matchingToolbarIndex >= 0) {
        this.selectToolbarSlot(matchingToolbarIndex, false);
      }
    }

    this.activateActionItem(item, {
      source: "hotbar",
      activateTool: view.actionType === "tool",
      announceEmpty: false,
    });
  }

  cycleHotbarPage(direction) {
    if (!Number.isFinite(direction) || direction === 0 || this.state.hotbars.length <= 1) {
      return;
    }

    const count = this.state.hotbars.length;
    this.state.activeHotbarIndex = (this.state.activeHotbarIndex + direction + count) % count;
    this.hud.pushMessage(`Active hotbar: ${this.state.activeHotbarIndex + 1}/${count}.`);
  }

  handleToolbarInput() {
    if (this.windowsOpen()) {
      return;
    }

    for (let i = 0; i < TOOLBAR_BINDINGS.length; i += 1) {
      const slot = TOOLBAR_BINDINGS[i];
      if (!slot.keyCode || !this.input.consumeAction(slot.keyCode)) {
        continue;
      }

      this.selectToolbarSlot(i, true);
      return;
    }

    for (let i = 0; i < HOTBAR_BINDINGS.length; i += 1) {
      const slot = HOTBAR_BINDINGS[i];
      if (!slot.keyCode || !this.input.consumeAction(slot.keyCode)) {
        continue;
      }

      this.activateHotbarSlot(i);
      return;
    }

    if (this.input.consumeAction("KeyG")) {
      this.cycleHotbarPage(1);
      return;
    }

    if (this.input.consumeAction("KeyB")) {
      this.cycleHotbarPage(-1);
      return;
    }

    const wheelDirection = this.input.consumeMouseWheelDirection();
    if (wheelDirection !== 0) {
      const next =
        (this.state.selectedSlot + (wheelDirection > 0 ? 1 : -1) + TOOLBAR_BINDINGS.length) %
        TOOLBAR_BINDINGS.length;
      this.selectToolbarSlot(next, false);
    }
  }

  selectToolbarSlot(index, announce = true) {
    const slot = this.getToolbarAssignment(index);
    if (index < 0 || index >= this.state.toolbarSlots.length) {
      return;
    }

    this.state.selectedSlot = index;
    this.hud.setToolbarActive(index);

    const view = this.getActionItemView(slot);
    if (!view) {
      this.state.ui.hammerWindowOpen = false;
      if (announce) {
        this.hud.pushMessage("Selected empty toolbar slot.");
      }
      return;
    }

    if (view.actionType === "tool") {
      this.state.selectedTool = view.itemId;
      if (view.itemId !== ToolId.HAMMER) {
        this.state.ui.hammerWindowOpen = false;
      }

      if (announce) {
        this.hud.pushMessage(`Equipped ${view.name}.`);
      }
      return;
    }

    this.state.ui.hammerWindowOpen = false;
    if (announce) {
      const count = this.state.resources[view.itemId] ?? 0;
      this.hud.pushMessage(`Selected ${view.name} (${count} available).`);
    }
  }

  handleGeneralActions() {
    const togglePlayerWindow = this.input.consumeAction("Tab");
    const toggleQuestJournal = this.input.consumeAction("KeyJ");
    const interactAction = this.input.consumeAction("KeyF");
    const secondaryAction = this.input.consumeAction("MouseRight");
    const selectedItem = this.getSelectedToolbarAssignment();
    const selectedView = this.getActionItemView(selectedItem);

    if (togglePlayerWindow) {
      this.state.ui.playerWindowOpen = !this.state.ui.playerWindowOpen;
      if (this.state.ui.playerWindowOpen) {
        this.state.ui.hammerWindowOpen = false;
        this.state.ui.objectWindowOpen = false;
        this.state.ui.objectWindowObjectId = null;
        this.state.ui.questJournalOpen = false;
        this.releasePointerLock();
        this.hud.pushMessage("Player window opened.");
      }
    }

    if (toggleQuestJournal) {
      this.state.ui.questJournalOpen = !this.state.ui.questJournalOpen;
      if (this.state.ui.questJournalOpen) {
        this.state.ui.playerWindowOpen = false;
        this.state.ui.hammerWindowOpen = false;
        this.state.ui.objectWindowOpen = false;
        this.state.ui.objectWindowObjectId = null;
      this.releasePointerLock();
        this.hud.pushMessage("Quest journal opened.");
      }
    }

    if (interactAction) {
      this.handleInteractAction();
    }

    if (secondaryAction && selectedView?.actionType === "tool" && selectedView.itemId === ToolId.HAMMER) {
      this.toggleHammerWindow();
    }

    const windowsOpen = this.windowsOpen();
    if (windowsOpen) {
      this.input.consumeAction("MouseLeft");
      this.input.consumeAction(RECLAIM_KEY_CODE);
      return;
    }

    const primaryAction = this.input.consumeAction("MouseLeft");
    const reclaimAction = this.input.consumeAction(RECLAIM_KEY_CODE);

    if (primaryAction) {
      this.activateActionItem(selectedItem, {
        source: "toolbar",
        activateTool: selectedView?.actionType === "tool",
      });
    }

    if (reclaimAction) {
      this.tryReclaimTarget();
    }
  }

  toggleHammerWindow() {
    const selectedItem = this.getSelectedToolbarAssignment();
    const selectedView = this.getActionItemView(selectedItem);
    if (!selectedView || selectedView.actionType !== "tool" || selectedView.itemId !== ToolId.HAMMER) {
      return;
    }

    const nextState = !this.state.ui.hammerWindowOpen;
    this.state.ui.hammerWindowOpen = nextState;

    if (nextState) {
      this.state.ui.playerWindowOpen = false;
      this.state.ui.objectWindowOpen = false;
      this.state.ui.objectWindowObjectId = null;
      this.state.ui.questJournalOpen = false;
      this.releasePointerLock();
      this.hud.pushMessage("Hammer build window opened.");
    }
  }

  selectHammerBuild(buildId, announce = true) {
    if (!BUILD_DEFINITIONS[buildId]) {
      return;
    }

    this.state.selectedBuild = buildId;
    if (announce) {
      this.hud.pushMessage(`Hammer set to ${BUILD_DEFINITIONS[buildId].name}.`);
    }
  }

  handleInteractAction() {
    const target = this.state.lookTarget;
    if (!target) {
      this.hud.pushMessage("Nothing to interact with.");
      return;
    }

    if (target.kind === "npc") {
      this.handleNpcInteraction(target.npc);
      return;
    }

    if (target.kind !== "object") {
      this.hud.pushMessage("No interactable target in range.");
      return;
    }

    if (target.object.type === ObjectType.DOOR) {
      const toggled = this.world.toggleDoor(target.tileX, target.tileY);
      if (!toggled) {
        this.hud.pushMessage("Door mechanism does not respond.");
        return;
      }

      const stateLabel = toggled.data.open ? "opened" : "closed";
      this.hud.pushMessage(`Door ${stateLabel}.`);
      return;
    }

    if (
      target.object.type === ObjectType.SMELTER ||
      target.object.type === ObjectType.STONE_CUTTER ||
      target.object.type === ObjectType.STOVE ||
      target.object.type === ObjectType.CONSTRUCTION_BENCH ||
      target.object.type === ObjectType.SMALL_CHEST
    ) {
      this.state.ui.playerWindowOpen = false;
      this.state.ui.hammerWindowOpen = false;
      this.state.ui.questJournalOpen = false;
      this.state.ui.objectWindowOpen = true;
      this.state.ui.objectWindowObjectId = target.object.id;
      this.releasePointerLock();
      this.ensureObjectCraftData(target.object);

      let label = "Workbench";
      if (target.object.type === ObjectType.SMELTER) {
        label = "Smelter";
      } else if (target.object.type === ObjectType.STONE_CUTTER) {
        label = "Stone Cutter";
      } else if (target.object.type === ObjectType.STOVE) {
        label = "Stove";
      } else if (target.object.type === ObjectType.CONSTRUCTION_BENCH) {
        label = "Construction Bench";
      } else if (target.object.type === ObjectType.SMALL_CHEST) {
        label = "Small Chest";
      }

      this.hud.pushMessage(`Opened ${label} window.`);
      return;
    }

    if (target.object.type === ObjectType.PICKUP) {
      this.hud.pushMessage("Walk over pickup items to collect them.");
      return;
    }

    this.hud.pushMessage("That object has no settings window.");
  }

  createGoblinQuestStep(npc, stepIndex) {
    const seedBase = WORLD_SEED + npc.id * 131 + npc.level * 43;
    const killRoll = random01(seedBase, stepIndex, 17);

    if (killRoll < 0.45) {
      const targetIndex = Math.floor(
        random01(seedBase + 19, stepIndex, 31) * GOBLIN_QUEST_KILL_TARGETS.length,
      ) % GOBLIN_QUEST_KILL_TARGETS.length;
      const targetKind = GOBLIN_QUEST_KILL_TARGETS[targetIndex];
      const required = clampNumber(1 + Math.floor((npc.level + stepIndex) / 3), 1, 6);
      return {
        type: "kill",
        targetKind,
        required,
        progress: 0,
        readyToTurnIn: false,
      };
    }

    const resourceIndex = Math.floor(
      random01(seedBase + 23, stepIndex, 47) * GOBLIN_QUEST_COLLECTION_RESOURCES.length,
    ) % GOBLIN_QUEST_COLLECTION_RESOURCES.length;
    const resourceId = GOBLIN_QUEST_COLLECTION_RESOURCES[resourceIndex];
    const required = clampNumber(2 + Math.floor(npc.level / 2) + stepIndex, 2, 10);
    return {
      type: "collect",
      resourceId,
      required,
      progress: 0,
      readyToTurnIn: false,
    };
  }

  assignGoblinQuest(npc) {
    const chainLength = Math.max(1, npc.questChainLength || 1);
    const steps = [];
    for (let stepIndex = 0; stepIndex < chainLength; stepIndex += 1) {
      steps.push(this.createGoblinQuestStep(npc, stepIndex));
    }

    npc.quest = {
      chainLength,
      steps,
      currentStepIndex: 0,
      completedSteps: 0,
      requiredSteps: Math.max(1, Math.ceil(chainLength * GOBLIN_QUEST_COMPLETION_RATIO)),
      completed: false,
    };
  }

  getActiveGoblinQuestStep(npc) {
    const quest = npc?.quest;
    if (!quest || quest.completed) {
      return null;
    }

    return quest.steps[quest.currentStepIndex] ?? null;
  }

  progressGoblinQuests(eventType, targetId, amount = 1) {
    if (amount <= 0) {
      return;
    }

    for (const npc of this.state.npcs) {
      if (!npc.alive || npc.kind !== "goblin" || npc.category === "allied") {
        continue;
      }

      const quest = npc.quest;
      if (!quest || quest.completed) {
        continue;
      }

      const step = this.getActiveGoblinQuestStep(npc);
      if (!step) {
        continue;
      }

      if (step.type !== eventType) {
        continue;
      }

      if (step.type === "kill" && step.targetKind !== targetId) {
        continue;
      }
      if (step.type === "collect" && step.resourceId !== targetId) {
        continue;
      }

      const previousProgress = step.progress;
      step.progress = Math.min(step.required, step.progress + amount);
      if (step.progress < step.required || previousProgress >= step.required || step.readyToTurnIn) {
        continue;
      }

      step.readyToTurnIn = true;
      this.hud.pushMessage(`${npcDisplayName(npc)} quest update ready. Press F to turn in.`);
    }
  }

  promoteGoblinToAllied(npc) {
    const alliedProfile = buildNpcProfile("ally", npc.level ?? 1);
    npc.category = "allied";
    npc.provoked = false;
    npc.aggroRange = alliedProfile.aggroRange;
    npc.attackRange = alliedProfile.attackRange;
    npc.attackDamage = alliedProfile.attackDamage;
    npc.attackInterval = alliedProfile.attackInterval;
    npc.attackCooldown = 0;
    npc.attackAnim = 0;
    npc.attackDidHit = false;
    npc.followDistance = alliedProfile.followDistance;
    npc.settleDistance = alliedProfile.settleDistance;
    npc.quest = {
      ...(npc.quest ?? {}),
      completed: true,
    };
  }

  handleAlliedNpcInteraction(npc) {
    const heldView = this.getHeldActionView();
    if (!heldView) {
      const gatherLabel = npc.gatherResourceId
        ? `Gathering ${RESOURCE_DEFINITIONS[npc.gatherResourceId]?.label ?? npc.gatherResourceId} (${npc.gatheredCount ?? 0}/${npc.gatherTargetCount ?? ALLIED_GATHER_STACK_TARGET})`
        : "No gather task";
      const craftRecipe = npc.desiredCraftRecipeId
        ? CRAFTING_RECIPES.find((recipe) => recipe.id === npc.desiredCraftRecipeId)?.name ?? "Unknown"
        : "No craft task";
      this.hud.pushMessage(`${npcDisplayName(npc)} status: ${gatherLabel} | Craft target: ${craftRecipe}.`);
      return;
    }

    if (heldView.itemKind === ACTION_ITEM_KIND.TOOL) {
      if (this.transferToolToNpc(npc, heldView.itemId)) {
        return;
      }

      const recipe = this.findRecipeForHeldAction(heldView);
      if (recipe) {
        this.setAlliedCraftObjective(npc, recipe);
        return;
      }

      this.hud.pushMessage("That tool cannot be used as an ally command.");
      return;
    }

    if (heldView.itemKind === ACTION_ITEM_KIND.RESOURCE) {
      if (ALLIED_GATHERABLE_RESOURCES.has(heldView.itemId)) {
        this.setAlliedGatherObjective(npc, heldView.itemId);
        return;
      }

      const recipe = this.findRecipeForHeldAction(heldView);
      if (recipe) {
        this.setAlliedCraftObjective(npc, recipe);
        return;
      }

      this.hud.pushMessage("No ally command is mapped to that item.");
      return;
    }

    this.hud.pushMessage("That item cannot be used for ally commands.");
  }

  handleNpcInteraction(npc) {
    if (!npc || !npc.alive) {
      this.hud.pushMessage("No living NPC in range.");
      return;
    }

    if (npc.category === "allied") {
      this.handleAlliedNpcInteraction(npc);
      return;
    }

    if (isNpcHostile(npc)) {
      this.hud.pushMessage(`${npcDisplayName(npc)} is hostile.`);
      return;
    }

    if (npc.kind !== "goblin") {
      this.hud.pushMessage(`${npcDisplayName(npc)} has nothing to discuss.`);
      return;
    }

    if (!npc.quest) {
      this.assignGoblinQuest(npc);
      const step = this.getActiveGoblinQuestStep(npc);
      const required = npc.quest?.requiredSteps ?? 1;
      const total = npc.quest?.chainLength ?? required;
      this.hud.pushMessage(`Goblin quest started (${required}/${total} required): ${describeQuestStep(step)}.`);
      return;
    }

    if (!npc.quest.completed) {
      const step = this.getActiveGoblinQuestStep(npc);
      if (!step) {
        this.hud.pushMessage("No active Goblin objective.");
        return;
      }

      if (step.progress >= step.required && !step.readyToTurnIn) {
        step.readyToTurnIn = true;
      }

      if (step.readyToTurnIn) {
        if (step.type === "collect") {
          const available = this.state.resources[step.resourceId] ?? 0;
          if (available < step.required) {
            const resourceLabel = RESOURCE_DEFINITIONS[step.resourceId]?.label ?? "resource";
            this.hud.pushMessage(
              `Turn-in failed: need ${step.required} ${resourceLabel} in inventory (${available}/${step.required}).`,
            );
            return;
          }

          this.state.resources[step.resourceId] = available - step.required;
        }

        step.readyToTurnIn = false;
        npc.quest.completedSteps += 1;

        if (npc.quest.completedSteps >= npc.quest.requiredSteps) {
          npc.quest.completed = true;
          this.hud.pushMessage("Goblin quest complete. Press F again to recruit.");
          return;
        }

        npc.quest.currentStepIndex = Math.min(npc.quest.currentStepIndex + 1, npc.quest.steps.length - 1);
        const nextStep = this.getActiveGoblinQuestStep(npc);
        this.hud.pushMessage(`Quest stage turned in. Next objective: ${describeQuestStep(nextStep)}.`);
        return;
      }

      this.hud.pushMessage(`Goblin objective: ${describeQuestStep(step)}.`);
      return;
    }

    this.promoteGoblinToAllied(npc);
    this.hud.pushMessage("Goblin joins you as an ally. Lead them to a constructed room with walls and a door.");
  }

  ensureObjectCraftData(object) {
    if (object.type === ObjectType.SMELTER) {
      if (!Array.isArray(object.data.ingredients)) {
        object.data.ingredients = [];
      }
      if (!object.data.selectedRecipeId) {
        object.data.selectedRecipeId = "smelt-copper";
      }
      object.data.ingredients = object.data.ingredients.slice(0, 4);
      return;
    }

    if (object.type === ObjectType.STONE_CUTTER) {
      if (!Array.isArray(object.data.ingredients)) {
        object.data.ingredients = [];
      }
      if (!object.data.selectedRecipeId) {
        object.data.selectedRecipeId = "cutter-cut-stone";
      }
      object.data.ingredients = object.data.ingredients.slice(0, 6);
      return;
    }

    if (object.type === ObjectType.CONSTRUCTION_BENCH) {
      if (!Array.isArray(object.data.ingredients)) {
        object.data.ingredients = [];
      }
      if (!object.data.selectedRecipeId) {
        object.data.selectedRecipeId = "wall-kit-reinforced";
      }
      object.data.ingredients = object.data.ingredients.slice(0, 8);
      return;
    }

    if (object.type === ObjectType.STOVE) {
      if (!Array.isArray(object.data.ingredients)) {
        object.data.ingredients = [];
      }
      if (!object.data.selectedRecipeId) {
        object.data.selectedRecipeId = "stove-simple-stew";
      }
      object.data.ingredients = object.data.ingredients.slice(0, 4);
    }
  }

  hasBuildCosts(costs) {
    for (const [resourceId, amount] of Object.entries(costs ?? {})) {
      if ((this.state.resources[resourceId] ?? 0) < amount) {
        return false;
      }
    }

    return true;
  }

  consumeBuildCosts(costs) {
    for (const [resourceId, amount] of Object.entries(costs ?? {})) {
      this.state.resources[resourceId] -= amount;
    }
  }

  refundBuildCosts(costs, ratio = 0.5) {
    for (const [resourceId, amount] of Object.entries(costs ?? {})) {
      const refund = Math.max(1, Math.floor(amount * ratio));
      this.state.resources[resourceId] = (this.state.resources[resourceId] ?? 0) + refund;
    }
  }

  buildObjectType(buildId) {
    if (buildId === BuildId.SMALL_CHEST) {
      return ObjectType.SMALL_CHEST;
    }
    if (buildId === BuildId.STONE_CUTTER) {
      return ObjectType.STONE_CUTTER;
    }
    if (buildId === BuildId.SMELTER) {
      return ObjectType.SMELTER;
    }
    if (buildId === BuildId.CONSTRUCTION_BENCH) {
      return ObjectType.CONSTRUCTION_BENCH;
    }
    if (buildId === BuildId.STOVE) {
      return ObjectType.STOVE;
    }
    if (buildId === BuildId.WALL_SEGMENT) {
      return ObjectType.WALL_SEGMENT;
    }
    if (buildId === BuildId.DOOR) {
      return ObjectType.DOOR;
    }

    return null;
  }

  buildObjectData(buildId) {
    if (buildId === BuildId.SMALL_CHEST) {
      return {
        slots: Array(SMALL_CHEST_SLOT_COUNT).fill(null),
      };
    }

    if (buildId === BuildId.STONE_CUTTER) {
      return {
        ingredients: [],
        selectedRecipeId: "cutter-cut-stone",
      };
    }

    if (buildId === BuildId.SMELTER) {
      return {
        ingredients: [],
        selectedRecipeId: "smelt-copper",
      };
    }

    if (buildId === BuildId.CONSTRUCTION_BENCH) {
      return {
        ingredients: [],
        selectedRecipeId: "wall-kit-reinforced",
      };
    }

    if (buildId === BuildId.STOVE) {
      return {
        ingredients: [],
        selectedRecipeId: "stove-simple-stew",
      };
    }

    if (buildId === BuildId.WALL_SEGMENT) {
      return { connections: 0 };
    }
    if (buildId === BuildId.DOOR) {
      return {};
    }

    return {};
  }

  performKnifePrimary() {
    if (this.state.combat.attackCooldown > 0) {
      return;
    }

    this.state.combat.attackCooldown = KNIFE_SWING_COOLDOWN;

    const target = this.state.lookTarget;
    if (!target || target.kind !== "npc") {
      this.hud.pushMessage("Knife slashes empty air.");
      return;
    }

    const npc = target.npc;
    if (!npc || !npc.alive) {
      this.hud.pushMessage("No valid enemy target.");
      return;
    }

    const knifeReach = target.knifeReach ?? (KNIFE_REACH + (npc.radius ?? 0) * KNIFE_RANGE_RADIUS_FACTOR);
    const dx = npc.x - this.state.player.x;
    const dy = npc.y - this.state.player.y;
    const actualDistance = Math.hypot(dx, dy);
    if (actualDistance > knifeReach) {
      this.hud.pushMessage(`Target is out of knife range (${actualDistance.toFixed(2)}m).`);
      return;
    }

    if (npc.category === "agnostic" && !npc.provoked) {
      npc.provoked = true;
      npc.attackCooldown = Math.min(npc.attackCooldown, 0.16);
      this.hud.pushMessage(`${npcDisplayName(npc)} is provoked by your attack.`);
    }

    const previousHealth = npc.health;
    npc.health = Math.max(0, npc.health - KNIFE_DAMAGE);
    const dealtDamage = previousHealth - npc.health;

    const reactDx = npc.x - this.state.player.x;
    const reactDy = npc.y - this.state.player.y;
    const reactLength = Math.hypot(reactDx, reactDy);
    if (reactLength > 0.001) {
      npc.hitReactX = reactDx / reactLength;
      npc.hitReactY = reactDy / reactLength;
    }

    npc.hurtTimer = 0.22;
    this.spawnDamagePopup(npc, dealtDamage);

    if (npc.health <= 0) {
      npc.alive = false;
      npc.deathTimer = 2.4;
      this.state.combat.kills += 1;
      this.recordNpcKill(npc.kind);
      this.dropNpcLoot(npc);
      this.hud.pushMessage(`${npcDisplayName(npc)} defeated.`);
      return;
    }

    this.hud.pushMessage(`${npcDisplayName(npc)} hit: ${npc.health}/${npc.maxHealth} HP remaining.`);
  }

  performPickaxePrimary() {
    const target = this.state.lookTarget;
    if (!target) {
      this.hud.pushMessage("Pickaxe swings at empty air.");
      return;
    }

    if (target.kind === "npc") {
      this.hud.pushMessage("Pickaxe is ineffective in combat. Use the knife.");
      return;
    }

    if (target.kind === "object" && target.object.type === ObjectType.ORE_NODE) {
      this.world.removeObject(target.tileX, target.tileY);
      const oreResourceId = target.object.data.resourceId ?? ResourceId.COPPER_ORE;
      this.addResource(oreResourceId, 1, { trackCollection: true });
      const oreLabel = RESOURCE_DEFINITIONS[oreResourceId]?.label ?? "Ore";
      this.hud.pushMessage(`Mined ore node (+1 ${oreLabel.toLowerCase()}).`);
      return;
    }

    if (target.kind === "object" && target.object.type === ObjectType.WOODY_ROOT) {
      this.world.removeObject(target.tileX, target.tileY);
      this.addResource(ResourceId.WOODY_ROOT, 1, { trackCollection: true });
      this.hud.pushMessage("Harvested woody roots (+1 wood).");
      return;
    }

    if (target.kind === "object" && target.object.type === ObjectType.MUSHROOM) {
      this.world.removeObject(target.tileX, target.tileY);
      this.addResource(ResourceId.MUSHROOM, 1, { trackCollection: true });
      this.hud.pushMessage("Harvested mushroom (+1 mushroom).");
      return;
    }

    if (target.kind === "object" && target.object.type === ObjectType.PICKUP) {
      this.hud.pushMessage("Move onto the pickup to collect it.");
      return;
    }

    if (target.kind === "block") {
      const chunkType = this.world.chunkTypeAtTile(target.tileX, target.tileY);
      if (chunkType !== ChunkType.CAVERN) {
        this.hud.pushMessage("Dungeon blocks are locked from mining.");
        return;
      }

      this.world.setTile(target.tileX, target.tileY, TileType.FLOOR);
      this.addResource(ResourceId.STONE_BLOCK, 1, { trackCollection: true });
      this.hud.pushMessage("Mined cavern block (+1 raw stone).");
      return;
    }

    this.hud.pushMessage("Pickaxe can mine ore nodes, woody roots, mushrooms, and cavern blocks.");
  }

    performHammerPrimary() {
    return this.performBuildPlacement(this.state.selectedBuild);
  }

  tryReclaimTarget() {
    const target = this.state.lookTarget;
    if (!target || target.kind !== "object") {
      this.hud.pushMessage("No constructed object to reclaim.");
      return;
    }

    if (
      target.object.type === ObjectType.ORE_NODE ||
      target.object.type === ObjectType.WOODY_ROOT ||
      target.object.type === ObjectType.MUSHROOM ||
      target.object.type === ObjectType.PICKUP
    ) {
      this.hud.pushMessage("Resource objects and pickups cannot be reclaimed with U.");
      return;
    }

    const removed = this.world.removeObject(target.tileX, target.tileY);
    if (!removed) {
      this.hud.pushMessage("Could not reclaim target.");
      return;
    }

    if (removed.id === this.state.ui.objectWindowObjectId) {
      this.state.ui.objectWindowOpen = false;
      this.state.ui.objectWindowObjectId = null;
    }

    if (removed.type === ObjectType.STONE_CUTTER) {
      this.refundBuildCosts(BUILD_DEFINITIONS[BuildId.STONE_CUTTER].costs, 0.5);
      this.refundIngredientsToInventory(removed.data.ingredients ?? []);
      this.hud.pushMessage("Reclaimed Stone Cutter Workbench (partial materials returned).");
      return;
    }

    if (removed.type === ObjectType.SMELTER) {
      this.refundBuildCosts(BUILD_DEFINITIONS[BuildId.SMELTER].costs, 0.5);
      this.refundIngredientsToInventory(removed.data.ingredients ?? []);
      this.hud.pushMessage("Reclaimed Smelter Workbench (partial materials returned).");
      return;
    }

    if (removed.type === ObjectType.CONSTRUCTION_BENCH) {
      this.refundBuildCosts(BUILD_DEFINITIONS[BuildId.CONSTRUCTION_BENCH].costs, 0.5);
      this.refundIngredientsToInventory(removed.data.ingredients ?? []);
      this.hud.pushMessage("Reclaimed Construction Workbench (partial materials returned).");
      return;
    }

    if (removed.type === ObjectType.STOVE) {
      this.refundBuildCosts(BUILD_DEFINITIONS[BuildId.STOVE].costs, 0.5);
      this.refundIngredientsToInventory(removed.data.ingredients ?? []);
      this.hud.pushMessage("Reclaimed Stove Workbench (partial materials returned).");
      return;
    }

    if (removed.type === ObjectType.SMALL_CHEST) {
      this.addResource(ResourceId.SMALL_CHEST, 1);
      this.refundIngredientsToInventory(removed.data.slots ?? []);
      this.hud.pushMessage("Reclaimed Small Chest (+1 chest, contents returned).");
      return;
    }

    if (removed.type === ObjectType.WALL_SEGMENT) {
      this.addResource(ResourceId.WALL_KIT, 1);
      this.hud.pushMessage("Reclaimed constructed wall segment (+1 wall kit).");
    }

    if (removed.type === ObjectType.DOOR) {
      this.addResource(ResourceId.DOOR_KIT, 1);
      this.hud.pushMessage("Reclaimed door (+1 door).");
    }
  }

  refundIngredientsToInventory(ingredients) {
    for (const resourceId of ingredients) {
      if (!resourceId) {
        continue;
      }
      this.addResource(resourceId, 1);
    }
  }

  addResource(resourceId, amount = 1, options = {}) {
    if (!resourceId || amount <= 0) {
      return;
    }

    this.state.resources[resourceId] = (this.state.resources[resourceId] ?? 0) + amount;

    if (options.trackCollection) {
      this.state.questProgress.collection[resourceId] =
        (this.state.questProgress.collection[resourceId] ?? 0) + amount;
      this.progressGoblinQuests("collect", resourceId, amount);
    }
  }

  recordNpcKill(kind) {
    if (!kind) {
      return;
    }

    this.state.questProgress.kills[kind] = (this.state.questProgress.kills[kind] ?? 0) + 1;
    this.progressGoblinQuests("kill", kind, 1);
  }

  buildInventorySlotsView() {
    const slots = [];
    const assignedToolIds = new Set();

    for (const item of this.state.toolbarSlots) {
      if (item?.kind === ACTION_ITEM_KIND.TOOL) {
        assignedToolIds.add(item.id);
      }
    }

    for (const hotbar of this.state.hotbars) {
      for (const item of hotbar ?? []) {
        if (item?.kind === ACTION_ITEM_KIND.TOOL) {
          assignedToolIds.add(item.id);
        }
      }
    }

    for (const toolDef of Object.values(TOOL_DEFINITIONS)) {
      if (!this.playerOwnsTool(toolDef.id) || assignedToolIds.has(toolDef.id)) {
        continue;
      }

      slots.push({
        itemKind: ACTION_ITEM_KIND.TOOL,
        itemId: toolDef.id,
        icon: toolDef.icon,
        label: toolDef.label,
        className: toolDef.className,
        count: 1,
      });
    }

    for (const resourceDef of Object.values(RESOURCE_DEFINITIONS)) {
      const count = this.state.resources[resourceDef.id] ?? 0;
      if (count <= 0) {
        continue;
      }

      slots.push({
        itemKind: ACTION_ITEM_KIND.RESOURCE,
        itemId: resourceDef.id,
        icon: resourceDef.icon,
        label: resourceDef.label,
        className: resourceDef.className,
        count,
      });
    }

    while (slots.length < INVENTORY_SLOT_COUNT) {
      slots.push(null);
    }

    return slots.slice(0, INVENTORY_SLOT_COUNT);
  }

  rollNpcLoot(npc) {
    const table = NPC_LOOT_TABLES[npc.kind] ?? [];
    const drops = [];

    for (const entry of table) {
      if (Math.random() > entry.chance) {
        continue;
      }

      drops.push({
        resourceId: entry.resourceId,
        amount: randomIntInclusive(entry.min, entry.max),
      });
    }

    if (!drops.length && npc.kind === "golem" && Math.random() <= 0.72) {
      drops.push({
        resourceId: ResourceId.COPPER_COIN,
        amount: randomIntInclusive(2, 4),
      });
    }

    return drops;
  }

  findPickupDropTile(originTileX, originTileY, resourceId, reservedTiles) {
    for (let radius = 0; radius <= 2; radius += 1) {
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const tileX = originTileX + ox;
          const tileY = originTileY + oy;
          const key = `${tileX},${tileY}`;

          if (reservedTiles.has(key) || !this.world.inTileBounds(tileX, tileY)) {
            continue;
          }

          if (this.world.getTile(tileX, tileY) !== TileType.FLOOR) {
            continue;
          }

          const existing = this.world.getObject(tileX, tileY);
          if (existing && existing.type === ObjectType.PICKUP && existing.data.resourceId === resourceId) {
            return { tileX, tileY, merge: true, key };
          }

          if (!existing) {
            return { tileX, tileY, merge: false, key };
          }
        }
      }
    }

    return null;
  }

  dropNpcLoot(npc) {
    const drops = this.rollNpcLoot(npc);
    if (!drops.length) {
      return;
    }

    const originTileX = Math.floor(npc.x);
    const originTileY = Math.floor(npc.y);
    const reservedTiles = new Set();
    const droppedSummary = {};

    for (const drop of drops) {
      const location = this.findPickupDropTile(originTileX, originTileY, drop.resourceId, reservedTiles);
      if (!location) {
        this.addResource(drop.resourceId, drop.amount, { trackCollection: true });
        droppedSummary[drop.resourceId] = (droppedSummary[drop.resourceId] ?? 0) + drop.amount;
        continue;
      }

      if (location.merge) {
        const existing = this.world.getObject(location.tileX, location.tileY);
        existing.data.amount = (existing.data.amount ?? 1) + drop.amount;
      } else {
        const placed = this.world.placeObject(location.tileX, location.tileY, ObjectType.PICKUP, {
          resourceId: drop.resourceId,
          amount: drop.amount,
        });

        if (!placed) {
          this.addResource(drop.resourceId, drop.amount, { trackCollection: true });
        }
      }

      reservedTiles.add(location.key);
      droppedSummary[drop.resourceId] = (droppedSummary[drop.resourceId] ?? 0) + drop.amount;
    }

    const summaryParts = Object.entries(droppedSummary).map(([resourceId, amount]) => {
      const label = RESOURCE_DEFINITIONS[resourceId]?.label ?? resourceId;
      return `${amount} ${label}`;
    });

    if (summaryParts.length) {
      this.hud.pushMessage(`Loot dropped: ${summaryParts.join(", ")}.`);
    }
  }

  collectNearbyPickups() {
    const playerX = this.state.player.x;
    const playerY = this.state.player.y;
    const centerTileX = Math.floor(playerX);
    const centerTileY = Math.floor(playerY);
    const nearbyPickups = [];

    this.world.forEachObjectNear(centerTileX, centerTileY, 2, (object) => {
      if (object.type !== ObjectType.PICKUP) {
        return;
      }

      const dx = object.tileX + 0.5 - playerX;
      const dy = object.tileY + 0.5 - playerY;
      if (dx * dx + dy * dy > PICKUP_AUTO_COLLECT_RADIUS * PICKUP_AUTO_COLLECT_RADIUS) {
        return;
      }

      nearbyPickups.push(object);
    });

    if (!nearbyPickups.length) {
      return;
    }

    const collectedSummary = {};

    for (const pickup of nearbyPickups) {
      const removed = this.world.removeObject(pickup.tileX, pickup.tileY);
      if (!removed || removed.type !== ObjectType.PICKUP) {
        continue;
      }

      const resourceId = removed.data.resourceId;
      const amount = Math.max(1, Math.floor(removed.data.amount ?? 1));
      this.addResource(resourceId, amount, { trackCollection: true });
      collectedSummary[resourceId] = (collectedSummary[resourceId] ?? 0) + amount;
    }

    const summaryParts = Object.entries(collectedSummary).map(([resourceId, amount]) => {
      const label = RESOURCE_DEFINITIONS[resourceId]?.label ?? resourceId;
      return `${amount} ${label}`;
    });

    if (summaryParts.length) {
      this.hud.pushMessage(`Picked up ${summaryParts.join(", ")}.`);
    }
  }

  getRecipesForStation(stationId) {
    return CRAFTING_RECIPES.filter((recipe) => recipe.stations.includes(stationId));
  }

  getContextRef(contextId) {
    if (contextId === "player") {
      return {
        contextId: "player",
        stationId: StationId.PLAYER,
        slots: this.state.ui.playerConstruction.slots,
        maxSlots: 4,
        getSelectedRecipeId: () => this.state.ui.playerConstruction.selectedRecipeId,
        setSelectedRecipeId: (recipeId) => {
          this.state.ui.playerConstruction.selectedRecipeId = recipeId;
        },
        title: "Player Window",
        subtitle: "Field Construction",
        settings: "Portable crafting slots. Drag resources and click Craft.",
      };
    }

    if (contextId === "object") {
      if (!this.state.ui.objectWindowOpen || !this.state.ui.objectWindowObjectId) {
        return null;
      }

      const object = this.world.getObjectById(this.state.ui.objectWindowObjectId);
      if (!object) {
        return null;
      }

      this.ensureObjectCraftData(object);

      if (object.type === ObjectType.SMALL_CHEST) {
        return {
          contextId: "object",
          stationId: StationId.STORAGE,
          slots: object.data.slots,
          maxSlots: SMALL_CHEST_SLOT_COUNT,
          getSelectedRecipeId: () => null,
          setSelectedRecipeId: () => {},
          title: "Small Chest",
          subtitle: `Tile ${object.tileX}, ${object.tileY}`,
          settings: "Storage only. Drag resources in and out.",
        };
      }

      if (object.type === ObjectType.SMELTER) {
        return {
          contextId: "object",
          stationId: StationId.SMELTER,
          slots: object.data.ingredients,
          maxSlots: 4,
          getSelectedRecipeId: () => object.data.selectedRecipeId,
          setSelectedRecipeId: (recipeId) => {
            object.data.selectedRecipeId = recipeId;
          },
          title: "Smelter Workbench",
          subtitle: `Tile ${object.tileX}, ${object.tileY}`,
          settings: "Drop copper, zinc, or iron ore into slots, then click Craft for matching ingots.",
        };
      }

      if (object.type === ObjectType.STOVE) {
        return {
          contextId: "object",
          stationId: StationId.STOVE,
          slots: object.data.ingredients,
          maxSlots: 4,
          getSelectedRecipeId: () => object.data.selectedRecipeId,
          setSelectedRecipeId: (recipeId) => {
            object.data.selectedRecipeId = recipeId;
          },
          title: "Stove Workbench",
          subtitle: `Tile ${object.tileX}, ${object.tileY}`,
          settings: "Cook food here. Add meat and mushrooms, then craft Simple Stew.",
        };
      }

      if (object.type === ObjectType.STONE_CUTTER) {
        return {
          contextId: "object",
          stationId: StationId.STONE_CUTTER,
          slots: object.data.ingredients,
          maxSlots: 6,
          getSelectedRecipeId: () => object.data.selectedRecipeId,
          setSelectedRecipeId: (recipeId) => {
            object.data.selectedRecipeId = recipeId;
          },
          title: "Stone Cutter Workbench",
          subtitle: `Tile ${object.tileX}, ${object.tileY}`,
          settings: "Insert raw stone and craft cut stone blocks or cut stone wall kits.",
        };
      }

      if (object.type === ObjectType.CONSTRUCTION_BENCH) {
        return {
          contextId: "object",
          stationId: StationId.CONSTRUCTION_BENCH,
          slots: object.data.ingredients,
          maxSlots: 8,
          getSelectedRecipeId: () => object.data.selectedRecipeId,
          setSelectedRecipeId: (recipeId) => {
            object.data.selectedRecipeId = recipeId;
          },
          title: "Construction Workbench",
          subtitle: `Tile ${object.tileX}, ${object.tileY}`,
          settings: "Use up to 8 inputs for advanced construction recipes.",
        };
      }
    }

    return null;
  }
  isResourceAllowedForStation(stationId, resourceId) {
    if (stationId === StationId.STORAGE) {
      return !!RESOURCE_DEFINITIONS[resourceId];
    }

    const recipes = this.getRecipesForStation(stationId);
    return recipes.some((recipe) => Object.keys(recipe.inputs).includes(resourceId));
  }

  getActionSlotStrip(target, hotbarIndex = this.state.activeHotbarIndex) {
    if (target === "toolbar") {
      return this.state.toolbarSlots;
    }

    if (target === "hotbar") {
      const index = clampNumber(hotbarIndex ?? this.state.activeHotbarIndex, 0, this.state.hotbars.length - 1);
      return this.state.hotbars[index] ?? null;
    }

    return null;
  }

  assignActionSlot(action) {
    const slots = this.getActionSlotStrip(action.target, action.hotbarIndex);
    if (!slots || action.slotIndex < 0 || action.slotIndex >= slots.length) {
      return;
    }

    const normalized = normalizeLoadoutItem(action.item);
    if (!normalized) {
      return;
    }

    if (normalized.kind === ACTION_ITEM_KIND.TOOL && !this.playerOwnsTool(normalized.id)) {
      this.hud.pushMessage("You do not currently own that tool.");
      return;
    }

    if (normalized.kind === ACTION_ITEM_KIND.RESOURCE && (this.state.resources[normalized.id] ?? 0) <= 0) {
      this.hud.pushMessage("Not enough resource in inventory.");
      return;
    }

    slots[action.slotIndex] = cloneLoadoutItem(normalized);

    if (action.target === "toolbar" && action.slotIndex === this.state.selectedSlot) {
      this.selectToolbarSlot(this.state.selectedSlot, false);
    }
  }

  moveActionSlot(action) {
    const fromSlots = this.getActionSlotStrip(action.fromTarget, action.fromHotbarIndex);
    const toSlots = this.getActionSlotStrip(action.toTarget, action.toHotbarIndex);
    if (!fromSlots || !toSlots) {
      return;
    }

    if (
      action.fromSlotIndex < 0 ||
      action.fromSlotIndex >= fromSlots.length ||
      action.toSlotIndex < 0 ||
      action.toSlotIndex >= toSlots.length
    ) {
      return;
    }

    const sameStrip =
      action.fromTarget === action.toTarget &&
      (action.fromTarget !== "hotbar" ||
        (action.fromHotbarIndex ?? this.state.activeHotbarIndex) ===
          (action.toHotbarIndex ?? this.state.activeHotbarIndex));
    if (sameStrip && action.fromSlotIndex === action.toSlotIndex) {
      return;
    }

    const moving = fromSlots[action.fromSlotIndex] ?? null;
    if (!moving) {
      return;
    }

    const displaced = toSlots[action.toSlotIndex] ?? null;
    toSlots[action.toSlotIndex] = cloneLoadoutItem(moving);
    fromSlots[action.fromSlotIndex] = cloneLoadoutItem(displaced);

    if (action.fromTarget === "toolbar" || action.toTarget === "toolbar") {
      this.selectToolbarSlot(this.state.selectedSlot, false);
    }
  }

  clearActionSlot(action) {
    const slots = this.getActionSlotStrip(action.target, action.hotbarIndex);
    if (!slots || action.slotIndex < 0 || action.slotIndex >= slots.length) {
      return;
    }

    slots[action.slotIndex] = null;
    if (action.target === "toolbar" && action.slotIndex === this.state.selectedSlot) {
      this.selectToolbarSlot(this.state.selectedSlot, false);
    }
  }

  buildActionSlotsView(slots) {
    return slots.map((item) => this.getActionItemView(item));
  }

  handleUiAction(action) {
    if (action.type === "close-player-window") {
      this.state.ui.playerWindowOpen = false;
      return;
    }

    if (action.type === "close-hammer-window") {
      this.state.ui.hammerWindowOpen = false;
      return;
    }

    if (action.type === "close-object-window") {
      this.state.ui.objectWindowOpen = false;
      this.state.ui.objectWindowObjectId = null;
      return;
    }

    if (action.type === "close-quest-window") {
      this.state.ui.questJournalOpen = false;
      return;
    }

    if (action.type === "set-quest-journal-tab") {
      if (action.tab === "active" || action.tab === "completed") {
        this.state.ui.questJournalTab = action.tab;
      }
      return;
    }

    if (action.type === "select-toolbar-slot") {
      this.selectToolbarSlot(action.slotIndex, true);
      return;
    }

    if (action.type === "activate-hotbar-slot") {
      this.activateHotbarSlot(action.slotIndex);
      return;
    }

    if (action.type === "assign-action-slot") {
      this.assignActionSlot(action);
      return;
    }

    if (action.type === "move-action-slot") {
      this.moveActionSlot(action);
      return;
    }

    if (action.type === "clear-action-slot") {
      this.clearActionSlot(action);
      return;
    }
    if (action.type === "select-build") {
      this.selectHammerBuild(action.buildId);
      return;
    }

    if (action.type === "select-recipe") {
      const context = this.getContextRef(action.contextId);
      if (!context) {
        return;
      }

      const recipe = this.getRecipesForStation(context.stationId).find((item) => item.id === action.recipeId);
      if (!recipe) {
        return;
      }

      context.setSelectedRecipeId(recipe.id);
      return;
    }

    if (action.type === "drop-resource") {
      this.dropResourceToSlot(action.contextId, action.slotIndex, action.resourceId);
      return;
    }

    if (action.type === "move-slot") {
      this.moveSlotResource(action);
      return;
    }

    if (action.type === "return-slot") {
      this.returnSlotResource(action.contextId, action.slotIndex);
      return;
    }

    if (action.type === "craft") {
      this.craftContext(action.contextId);
      return;
    }

    if (action.type === "clear-slots") {
      this.clearContextSlots(action.contextId);
    }
  }

  dropResourceToSlot(contextId, slotIndex, resourceId) {
    const context = this.getContextRef(contextId);
    if (!context) {
      return;
    }

    if (!this.isResourceAllowedForStation(context.stationId, resourceId)) {
      this.hud.pushMessage("That resource is not valid for this crafting station.");
      return;
    }

    if (slotIndex < 0 || slotIndex >= context.maxSlots) {
      return;
    }

    if (context.slots[slotIndex]) {
      this.hud.pushMessage("Craft slot is occupied.");
      return;
    }

    if ((this.state.resources[resourceId] ?? 0) <= 0) {
      this.hud.pushMessage("Not enough resource in inventory.");
      return;
    }

    this.state.resources[resourceId] -= 1;
    context.slots[slotIndex] = resourceId;
  }

  moveSlotResource(action) {
    const fromContext = this.getContextRef(action.fromContextId);
    const toContext = this.getContextRef(action.toContextId);
    if (!fromContext || !toContext) {
      return;
    }

    if (
      action.fromSlotIndex < 0 ||
      action.fromSlotIndex >= fromContext.maxSlots ||
      action.toSlotIndex < 0 ||
      action.toSlotIndex >= toContext.maxSlots
    ) {
      return;
    }

    if (action.fromContextId === action.toContextId && action.fromSlotIndex === action.toSlotIndex) {
      return;
    }

    const movingResource = fromContext.slots[action.fromSlotIndex];
    if (!movingResource) {
      return;
    }

    if (!this.isResourceAllowedForStation(toContext.stationId, movingResource)) {
      this.hud.pushMessage("Target station does not accept that resource.");
      return;
    }

    if (toContext.slots[action.toSlotIndex]) {
      this.hud.pushMessage("Target slot is occupied.");
      return;
    }

    fromContext.slots[action.fromSlotIndex] = null;
    toContext.slots[action.toSlotIndex] = movingResource;
  }

  returnSlotResource(contextId, slotIndex) {
    const context = this.getContextRef(contextId);
    if (!context) {
      return;
    }

    if (slotIndex < 0 || slotIndex >= context.maxSlots) {
      return;
    }

    const resourceId = context.slots[slotIndex];
    if (!resourceId) {
      return;
    }

    context.slots[slotIndex] = null;
    this.addResource(resourceId, 1);
  }

  clearContextSlots(contextId) {
    const context = this.getContextRef(contextId);
    if (!context) {
      return;
    }

    this.refundIngredientsToInventory(context.slots);
    for (let i = 0; i < context.slots.length; i += 1) {
      context.slots[i] = null;
    }

    this.hud.pushMessage("Crafting slots cleared to inventory.");
  }

  craftContext(contextId) {
    const context = this.getContextRef(contextId);
    if (!context) {
      return;
    }

    const recipes = this.getRecipesForStation(context.stationId);
    if (recipes.length === 0) {
      this.hud.pushMessage("This object is storage-only.");
      return;
    }

    const selectedRecipeId = context.getSelectedRecipeId();
    const recipe = recipes.find((candidate) => candidate.id === selectedRecipeId) ?? recipes[0];

    context.setSelectedRecipeId(recipe.id);

    if (!hasRecipeInputs(context.slots, recipe)) {
      this.hud.pushMessage(`Missing ingredients for ${recipe.name}.`);
      return;
    }

    for (const [toolId, amount] of Object.entries(recipe.toolOutputs ?? {})) {
      if (amount > 0 && this.playerOwnsTool(toolId)) {
        this.hud.pushMessage(`You already own ${TOOL_DEFINITIONS[toolId]?.label ?? toolId}.`);
        return;
      }
    }

    consumeSlotInputs(context.slots, recipe.inputs);

    for (const [resourceId, amount] of Object.entries(recipe.outputs ?? {})) {
      this.addResource(resourceId, amount);
    }

    for (const [toolId, amount] of Object.entries(recipe.toolOutputs ?? {})) {
      if (amount > 0) {
        this.addPlayerTool(toolId);
      }
    }

    this.hud.pushMessage(`Crafted ${recipe.name}: ${recipeOutputString(recipe)}.`);
  }

  syncObjectWindowValidity() {
    if (!this.state.ui.objectWindowOpen || !this.state.ui.objectWindowObjectId) {
      return;
    }

    const object = this.world.getObjectById(this.state.ui.objectWindowObjectId);
    if (
      !object ||
      (object.type !== ObjectType.SMELTER &&
        object.type !== ObjectType.STOVE &&
        object.type !== ObjectType.STONE_CUTTER &&
        object.type !== ObjectType.CONSTRUCTION_BENCH &&
        object.type !== ObjectType.SMALL_CHEST)
    ) {
      this.state.ui.objectWindowOpen = false;
      this.state.ui.objectWindowObjectId = null;
      this.hud.pushMessage("Object window closed (target no longer available).");
    }
  }

  buildContextView(contextId) {
    const context = this.getContextRef(contextId);
    if (!context) {
      return null;
    }

    const recipes = this.getRecipesForStation(context.stationId);

    if (recipes.length === 0) {
      return {
        contextId,
        title: context.title,
        subtitle: context.subtitle,
        settings: context.settings,
        slots: context.slots,
        maxSlots: context.maxSlots,
        selectedRecipeId: null,
        recipes: [],
        canCraftSelected: false,
      };
    }

    let selectedRecipeId = context.getSelectedRecipeId();
    if (!recipes.some((recipe) => recipe.id === selectedRecipeId)) {
      selectedRecipeId = recipes[0].id;
      context.setSelectedRecipeId(selectedRecipeId);
    }

    const recipesView = recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      requires: resourceString(recipe.inputs),
      produces: recipeOutputString(recipe),
      canCraft: hasRecipeInputs(context.slots, recipe),
    }));

    const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId);

    return {
      contextId,
      title: context.title,
      subtitle: context.subtitle,
      settings: context.settings,
      slots: context.slots,
      maxSlots: context.maxSlots,
      selectedRecipeId,
      recipes: recipesView,
      canCraftSelected: selectedRecipe ? hasRecipeInputs(context.slots, selectedRecipe) : false,
    };
  }

  buildHammerOptionsView() {
    return BUILD_OPTIONS.map((buildId) => {
      const definition = BUILD_DEFINITIONS[buildId];
      const costs = definition?.costs ?? {};
      return {
        id: buildId,
        name: definition?.name ?? buildId,
        costText: resourceString(costs),
        affordable: this.hasBuildCosts(costs),
        selected: this.state.selectedBuild === buildId,
      };
    });
  }

  buildQuestJournalView() {
    const active = [];
    const completed = [];

    for (const npc of this.state.npcs) {
      if (npc.kind !== "goblin" || !npc.quest) {
        continue;
      }

      const quest = npc.quest;
      const stageIndex = Math.max(0, quest.currentStepIndex ?? 0);
      const stage = quest.steps?.[stageIndex] ?? null;
      const stageLabel = quest.completed
        ? "Quest chain complete."
        : `${describeQuestStep(stage)}${stage?.readyToTurnIn ? " (Turn in ready)" : ""}`;
      const metaParts = [
        `Goblin Lv ${npc.level ?? 1}`,
        `Stages ${quest.completedSteps ?? 0}/${quest.requiredSteps ?? 1}`,
      ];

      if (quest.completed) {
        metaParts.push(npc.category === "allied" ? "Allied" : "Ready to recruit");
      } else {
        metaParts.push(`Current ${stageIndex + 1}/${quest.chainLength ?? quest.steps?.length ?? 1}`);
      }

      const entry = {
        id: npc.id,
        title: `Goblin #${npc.id}`,
        meta: metaParts.join(" | "),
        stage: stageLabel,
      };

      if (quest.completed) {
        completed.push(entry);
      } else {
        active.push(entry);
      }
    }

    active.sort((a, b) => a.id - b.id);
    completed.sort((a, b) => a.id - b.id);

    return {
      selectedTab: this.state.ui.questJournalTab === "completed" ? "completed" : "active",
      active,
      completed,
    };
  }

  buildWindowState() {
    const selectedToolbarView = this.getActionItemView(this.getSelectedToolbarAssignment());
    const hammerOpen =
      this.state.ui.hammerWindowOpen &&
      selectedToolbarView?.actionType === "tool" &&
      selectedToolbarView.itemId === ToolId.HAMMER;

    return {
      playerOpen: this.state.ui.playerWindowOpen,
      hammerOpen,
      objectOpen: this.state.ui.objectWindowOpen,
      questOpen: this.state.ui.questJournalOpen,
      selectedBuild: this.state.selectedBuild,
      selectedToolbarSlot: this.state.selectedSlot,
      toolbarSlots: this.buildActionSlotsView(this.state.toolbarSlots),
      hotbarSlots: this.buildActionSlotsView(this.state.hotbars[this.state.activeHotbarIndex] ?? []),
      activeHotbarIndex: this.state.activeHotbarIndex,
      hotbarCount: this.state.hotbars.length,
      hammerBuildOptions: hammerOpen ? this.buildHammerOptionsView() : [],
      inventorySlots: this.buildInventorySlotsView(),
      playerContext: this.state.ui.playerWindowOpen ? this.buildContextView("player") : null,
      objectContext: this.state.ui.objectWindowOpen ? this.buildContextView("object") : null,
      questJournal: this.state.ui.questJournalOpen ? this.buildQuestJournalView() : null,
    };
  }

  refreshHud() {
    this.hud.setStatus(this.state);
    this.hud.setWindowState(this.buildWindowState());
  }
}
































































































































































