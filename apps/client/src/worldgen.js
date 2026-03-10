import {
  CHUNK_TILES,
  WORLD_CHUNKS,
  WORLD_TILES,
  HALF_CHUNKS,
  ORIGIN_TILE,
  ChunkType,
  TileType,
  ObjectType,
  ResourceId,
} from "./config.js";
import { random01 } from "./rng.js";

const DUNGEON_RING_INTERVAL = 6;
const DUNGEON_SPACING = 9;

const WALL_CONNECTION_N = 1;
const WALL_CONNECTION_E = 2;
const WALL_CONNECTION_S = 4;
const WALL_CONNECTION_W = 8;
const WALL_SEGMENT_THICKNESS = 0.24;
const BENCH_HALF_EXTENT = 0.34;
const CHEST_HALF_EXTENT = 0.3;
const DOOR_HALF_LENGTH = 0.34;
const DOOR_HALF_THICKNESS = 0.06;

function tileIndex(x, y) {
  return y * WORLD_TILES + x;
}

function chunkIndex(ix, iy) {
  return iy * WORLD_CHUNKS + ix;
}

function inTileBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_TILES && y < WORLD_TILES;
}

function inChunkBounds(ix, iy) {
  return ix >= 0 && iy >= 0 && ix < WORLD_CHUNKS && iy < WORLD_CHUNKS;
}

function tileToChunkCoord(tile) {
  return Math.floor(tile / CHUNK_TILES) - HALF_CHUNKS;
}

function buildDungeonAnchors(seed) {
  const anchors = [];
  const maxRadius = Math.ceil(Math.hypot(HALF_CHUNKS, HALF_CHUNKS));

  for (let ring = 1; ring * DUNGEON_RING_INTERVAL <= maxRadius + 2; ring += 1) {
    const baseRadius = ring * DUNGEON_RING_INTERVAL;
    const circumference = 2 * Math.PI * baseRadius;
    const count = Math.max(3, Math.floor(circumference / DUNGEON_SPACING));

    for (let i = 0; i < count; i += 1) {
      const angleJitter = (random01(seed + ring * 37, i * 19, ring * 5) - 0.5) * 0.7;
      const radiusJitter = (random01(seed + ring * 53, i * 7, ring * 11) - 0.5) * 1.6;
      const angle = (i / count) * Math.PI * 2 + angleJitter;
      const radius = baseRadius + radiusJitter;

      const x = Math.round(Math.cos(angle) * radius);
      const y = Math.round(Math.sin(angle) * radius);
      const dungeonRadius = random01(seed + ring * 79, i * 13, 97) > 0.64 ? 3 : 2;

      if (Math.hypot(x, y) < 3) {
        continue;
      }

      const tooClose = anchors.some((anchor) => Math.hypot(anchor.x - x, anchor.y - y) < 4);
      if (tooClose) {
        continue;
      }

      anchors.push({ x, y, radius: dungeonRadius });
    }
  }

  return anchors;
}

function resolveChunkType(chunkX, chunkY, anchors) {
  if (Math.hypot(chunkX, chunkY) <= 2) {
    return ChunkType.CAVERN;
  }

  for (const anchor of anchors) {
    if (Math.hypot(chunkX - anchor.x, chunkY - anchor.y) <= anchor.radius) {
      return ChunkType.DUNGEON;
    }
  }

  return ChunkType.CAVERN;
}

function carveRect(layout, x, y, width, height, tileType = TileType.FLOOR) {
  for (let ly = y; ly < y + height; ly += 1) {
    if (ly < 0 || ly >= CHUNK_TILES) {
      continue;
    }

    for (let lx = x; lx < x + width; lx += 1) {
      if (lx < 0 || lx >= CHUNK_TILES) {
        continue;
      }

      layout[ly * CHUNK_TILES + lx] = tileType;
    }
  }
}

function carveBoundaryOpening(layout, side, center, width = 2, depth = 2) {
  const half = Math.floor(width / 2);

  if (side === "north") {
    carveRect(layout, center - half, 0, width, depth);
  } else if (side === "south") {
    carveRect(layout, center - half, CHUNK_TILES - depth, width, depth);
  } else if (side === "west") {
    carveRect(layout, 0, center - half, depth, width);
  } else if (side === "east") {
    carveRect(layout, CHUNK_TILES - depth, center - half, depth, width);
  }
}

function hasWallNeighbor(layout, x, y) {
  const neighbors = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  for (const [ox, oy] of neighbors) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= CHUNK_TILES || ny >= CHUNK_TILES) {
      continue;
    }

    if (layout[ny * CHUNK_TILES + nx] === TileType.WALL) {
      return true;
    }
  }

  return false;
}

function generateCavernLayout(seed, chunkX, chunkY, neighbors) {
  let layout = new Uint8Array(CHUNK_TILES * CHUNK_TILES);

  for (let y = 0; y < CHUNK_TILES; y += 1) {
    for (let x = 0; x < CHUNK_TILES; x += 1) {
      const worldX = (chunkX + HALF_CHUNKS) * CHUNK_TILES + x;
      const worldY = (chunkY + HALF_CHUNKS) * CHUNK_TILES + y;

      let sample = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          sample += random01(seed + 101, worldX + ox * 2, worldY + oy * 2);
        }
      }

      sample /= 9;
      layout[y * CHUNK_TILES + x] = sample > 0.58 ? TileType.FLOOR : TileType.WALL;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const next = layout.slice();

    for (let y = 1; y < CHUNK_TILES - 1; y += 1) {
      for (let x = 1; x < CHUNK_TILES - 1; x += 1) {
        let floors = 0;

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) {
              continue;
            }

            if (layout[(y + oy) * CHUNK_TILES + (x + ox)] === TileType.FLOOR) {
              floors += 1;
            }
          }
        }

        next[y * CHUNK_TILES + x] = floors >= 6 ? TileType.FLOOR : TileType.WALL;
      }
    }

    layout = next;
  }

  carveRect(layout, 7, 7, 2, 2);

  const northOpen =
    neighbors.north === ChunkType.DUNGEON ||
    (neighbors.north && random01(seed + 301, chunkX, chunkY) > 0.78);
  const southOpen =
    neighbors.south === ChunkType.DUNGEON ||
    (neighbors.south && random01(seed + 307, chunkX, chunkY) > 0.78);
  const westOpen =
    neighbors.west === ChunkType.DUNGEON ||
    (neighbors.west && random01(seed + 311, chunkX, chunkY) > 0.78);
  const eastOpen =
    neighbors.east === ChunkType.DUNGEON ||
    (neighbors.east && random01(seed + 313, chunkX, chunkY) > 0.78);

  const centerA = 4 + Math.floor(random01(seed + 317, chunkX, chunkY) * 8);
  const centerB = 4 + Math.floor(random01(seed + 331, chunkX, chunkY) * 8);

  if (northOpen) {
    carveBoundaryOpening(layout, "north", centerA);
  }
  if (southOpen) {
    carveBoundaryOpening(layout, "south", centerB);
  }
  if (westOpen) {
    carveBoundaryOpening(layout, "west", centerA);
  }
  if (eastOpen) {
    carveBoundaryOpening(layout, "east", centerB);
  }

  return layout;
}

function shouldOpenDungeonSide(sideType, seed, chunkX, chunkY, salt) {
  if (!sideType) {
    return false;
  }

  if (sideType === ChunkType.DUNGEON) {
    return true;
  }

  return random01(seed + salt, chunkX, chunkY) > 0.45;
}

function pickDungeonOreType(seed, worldX, worldY) {
  const roll = random01(seed + 469, worldX, worldY);
  if (roll > 0.68) {
    return ResourceId.IRON_ORE;
  }
  if (roll > 0.34) {
    return ResourceId.ZINC_ORE;
  }
  return ResourceId.COPPER_ORE;
}

function generateDungeonLayout(seed, chunkX, chunkY, neighbors) {
  const layout = new Uint8Array(CHUNK_TILES * CHUNK_TILES).fill(TileType.WALL);
  const oreSpawns = [];

  const roomW = 7 + Math.floor(random01(seed + 401, chunkX, chunkY) * 4);
  const roomH = 7 + Math.floor(random01(seed + 409, chunkX, chunkY) * 4);
  const roomX = Math.max(1, Math.floor((CHUNK_TILES - roomW) / 2));
  const roomY = Math.max(1, Math.floor((CHUNK_TILES - roomH) / 2));

  carveRect(layout, roomX, roomY, roomW, roomH);

  const middleX = Math.floor(CHUNK_TILES / 2);
  const middleY = Math.floor(CHUNK_TILES / 2);

  const northOpen = shouldOpenDungeonSide(neighbors.north, seed, chunkX, chunkY, 421);
  const southOpen = shouldOpenDungeonSide(neighbors.south, seed, chunkX, chunkY, 431);
  const westOpen = shouldOpenDungeonSide(neighbors.west, seed, chunkX, chunkY, 433);
  const eastOpen = shouldOpenDungeonSide(neighbors.east, seed, chunkX, chunkY, 439);

  if (northOpen) {
    carveRect(layout, middleX - 1, 0, 2, roomY + 1);
  }
  if (southOpen) {
    carveRect(layout, middleX - 1, roomY + roomH - 1, 2, CHUNK_TILES - (roomY + roomH - 1));
  }
  if (westOpen) {
    carveRect(layout, 0, middleY - 1, roomX + 1, 2);
  }
  if (eastOpen) {
    carveRect(layout, roomX + roomW - 1, middleY - 1, CHUNK_TILES - (roomX + roomW - 1), 2);
  }

  if (!northOpen && !southOpen && !westOpen && !eastOpen) {
    carveRect(layout, middleX - 1, 0, 2, roomY + 1);
  }

  if (random01(seed + 443, chunkX, chunkY) > 0.68) {
    const sideRoomX = random01(seed + 449, chunkX, chunkY) > 0.5 ? 1 : CHUNK_TILES - 6;
    const sideRoomY = 2 + Math.floor(random01(seed + 457, chunkX, chunkY) * 7);
    carveRect(layout, sideRoomX, sideRoomY, 4, 4);

    if (sideRoomX < middleX) {
      carveRect(layout, sideRoomX + 3, sideRoomY + 1, middleX - sideRoomX - 1, 2);
    } else {
      carveRect(layout, middleX, sideRoomY + 1, sideRoomX - middleX + 1, 2);
    }
  }

  for (let y = 1; y < CHUNK_TILES - 1; y += 1) {
    for (let x = 1; x < CHUNK_TILES - 1; x += 1) {
      const idx = y * CHUNK_TILES + x;
      if (layout[idx] !== TileType.FLOOR) {
        continue;
      }

      const worldX = chunkX * CHUNK_TILES + x;
      const worldY = chunkY * CHUNK_TILES + y;
      const oreChance = random01(seed + 467, worldX, worldY);
      if (oreChance > 0.945 && hasWallNeighbor(layout, x, y)) {
        oreSpawns.push({
          x,
          y,
          resourceId: pickDungeonOreType(seed, worldX, worldY),
        });
      }
    }
  }

  return { layout, oreSpawns };
}

function forceSpawnPocket(tiles) {
  for (let oy = -3; oy <= 3; oy += 1) {
    for (let ox = -3; ox <= 3; ox += 1) {
      const x = ORIGIN_TILE + ox;
      const y = ORIGIN_TILE + oy;
      if (inTileBounds(x, y)) {
        tiles[tileIndex(x, y)] = TileType.FLOOR;
      }
    }
  }
}

function carveCircle(tiles, cx, cy, radius, chunkTypeAtTileFn) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox * ox + oy * oy > radius * radius) {
        continue;
      }

      const x = cx + ox;
      const y = cy + oy;
      if (!inTileBounds(x, y)) {
        continue;
      }

      const chunkType = chunkTypeAtTileFn(x, y);
      if (chunkType === ChunkType.CAVERN) {
        tiles[tileIndex(x, y)] = TileType.FLOOR;
      }
    }
  }
}

function carveGuidingTunnel(tiles, start, target, seed, chunkTypeAtTileFn) {
  let x = start.x;
  let y = start.y;

  for (let i = 0; i < 2200; i += 1) {
    const dx = target.x - x;
    const dy = target.y - y;

    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      break;
    }

    const chooseHorizontal =
      Math.abs(dx) > Math.abs(dy)
        ? true
        : Math.abs(dx) < Math.abs(dy)
          ? false
          : random01(seed + 601, x + i, y - i) > 0.5;

    if (chooseHorizontal && dx !== 0) {
      x += Math.sign(dx);
    } else if (dy !== 0) {
      y += Math.sign(dy);
    } else if (dx !== 0) {
      x += Math.sign(dx);
    }

    carveCircle(tiles, x, y, 1, chunkTypeAtTileFn);
  }
}

function carveGuidingTunnels(tiles, chunkTypes, seed) {
  const chunkTypeAtTileFn = (tileX, tileY) => {
    const chunkX = tileToChunkCoord(tileX);
    const chunkY = tileToChunkCoord(tileY);
    const ix = chunkX + HALF_CHUNKS;
    const iy = chunkY + HALF_CHUNKS;

    if (!inChunkBounds(ix, iy)) {
      return null;
    }

    return chunkTypes[chunkIndex(ix, iy)];
  };

  const targets = [];

  for (let iy = 0; iy < WORLD_CHUNKS; iy += 1) {
    for (let ix = 0; ix < WORLD_CHUNKS; ix += 1) {
      const chunkX = ix - HALF_CHUNKS;
      const chunkY = iy - HALF_CHUNKS;
      const kind = chunkTypes[chunkIndex(ix, iy)];
      if (kind !== ChunkType.DUNGEON) {
        continue;
      }

      const distance = Math.hypot(chunkX, chunkY);
      if (distance < 4 || distance > 12) {
        continue;
      }

      targets.push({
        distance,
        tileX: ix * CHUNK_TILES + Math.floor(CHUNK_TILES / 2),
        tileY: iy * CHUNK_TILES + Math.floor(CHUNK_TILES / 2),
      });
    }
  }

  targets.sort((a, b) => a.distance - b.distance);

  const origin = { x: ORIGIN_TILE, y: ORIGIN_TILE };
  const count = Math.min(4, targets.length);

  for (let i = 0; i < count; i += 1) {
    carveGuidingTunnel(
      tiles,
      origin,
      { x: targets[i].tileX, y: targets[i].tileY },
      seed + i * 17,
      chunkTypeAtTileFn,
    );
  }
}

export function createWorld(seed) {
  const chunkTypes = new Array(WORLD_CHUNKS * WORLD_CHUNKS);
  const tiles = new Uint8Array(WORLD_TILES * WORLD_TILES).fill(TileType.WALL);
  const pendingObjects = [];
  const anchors = buildDungeonAnchors(seed);

  for (let iy = 0; iy < WORLD_CHUNKS; iy += 1) {
    for (let ix = 0; ix < WORLD_CHUNKS; ix += 1) {
      const chunkX = ix - HALF_CHUNKS;
      const chunkY = iy - HALF_CHUNKS;
      chunkTypes[chunkIndex(ix, iy)] = resolveChunkType(chunkX, chunkY, anchors);
    }
  }

  const getChunkTypeByIndex = (ix, iy) => {
    if (!inChunkBounds(ix, iy)) {
      return null;
    }

    return chunkTypes[chunkIndex(ix, iy)];
  };

  for (let iy = 0; iy < WORLD_CHUNKS; iy += 1) {
    for (let ix = 0; ix < WORLD_CHUNKS; ix += 1) {
      const chunkX = ix - HALF_CHUNKS;
      const chunkY = iy - HALF_CHUNKS;
      const chunkType = chunkTypes[chunkIndex(ix, iy)];
      const neighbors = {
        north: getChunkTypeByIndex(ix, iy - 1),
        south: getChunkTypeByIndex(ix, iy + 1),
        west: getChunkTypeByIndex(ix - 1, iy),
        east: getChunkTypeByIndex(ix + 1, iy),
      };

      const generated =
        chunkType === ChunkType.DUNGEON
          ? generateDungeonLayout(seed, chunkX, chunkY, neighbors)
          : { layout: generateCavernLayout(seed, chunkX, chunkY, neighbors), oreSpawns: [] };

      const startX = ix * CHUNK_TILES;
      const startY = iy * CHUNK_TILES;

      for (let y = 0; y < CHUNK_TILES; y += 1) {
        for (let x = 0; x < CHUNK_TILES; x += 1) {
          const worldX = startX + x;
          const worldY = startY + y;
          tiles[tileIndex(worldX, worldY)] = generated.layout[y * CHUNK_TILES + x];
        }
      }

      for (const spawn of generated.oreSpawns) {
        pendingObjects.push({
          type: ObjectType.ORE_NODE,
          tileX: startX + spawn.x,
          tileY: startY + spawn.y,
          data: {
            richness: 1,
            resourceId: spawn.resourceId,
          },
        });
      }

      for (let y = 1; y < CHUNK_TILES - 1; y += 1) {
        for (let x = 1; x < CHUNK_TILES - 1; x += 1) {
          const idx = y * CHUNK_TILES + x;
          if (generated.layout[idx] !== TileType.FLOOR) {
            continue;
          }

          const nearWall = hasWallNeighbor(generated.layout, x, y);
          const worldX = chunkX * CHUNK_TILES + x;
          const worldY = chunkY * CHUNK_TILES + y;

          if (nearWall) {
            const rootChance = random01(seed + 487, worldX, worldY);
            if (rootChance > 0.978) {
              pendingObjects.push({
                type: ObjectType.WOODY_ROOT,
                tileX: startX + x,
                tileY: startY + y,
                data: {
                  resourceId: ResourceId.WOODY_ROOT,
                  hang: 0.9 + random01(seed + 491, worldX, worldY) * 0.9,
                },
              });
              continue;
            }
          }

          const mushroomChance = random01(seed + 503, worldX, worldY);
          const mushroomThreshold = nearWall ? 0.982 : 0.992;
          if (mushroomChance > mushroomThreshold) {
            pendingObjects.push({
              type: ObjectType.MUSHROOM,
              tileX: startX + x,
              tileY: startY + y,
              data: {
                resourceId: ResourceId.MUSHROOM,
                capScale: 0.8 + random01(seed + 509, worldX, worldY) * 0.45,
              },
            });
          }
        }
      }
    }
  }

  for (let x = 0; x < WORLD_TILES; x += 1) {
    tiles[tileIndex(x, 0)] = TileType.WALL;
    tiles[tileIndex(x, WORLD_TILES - 1)] = TileType.WALL;
  }

  for (let y = 0; y < WORLD_TILES; y += 1) {
    tiles[tileIndex(0, y)] = TileType.WALL;
    tiles[tileIndex(WORLD_TILES - 1, y)] = TileType.WALL;
  }

  forceSpawnPocket(tiles);
  carveGuidingTunnels(tiles, chunkTypes, seed);

  const objects = new Map();
  const objectsById = new Map();
  let nextObjectId = 1;

  function objectKey(tileX, tileY) {
    return tileIndex(tileX, tileY);
  }

  function getTile(tileX, tileY) {
    if (!inTileBounds(tileX, tileY)) {
      return TileType.WALL;
    }

    return tiles[tileIndex(tileX, tileY)];
  }

  function setTile(tileX, tileY, tileType) {
    if (!inTileBounds(tileX, tileY)) {
      return;
    }

    tiles[tileIndex(tileX, tileY)] = tileType;
  }

  function chunkTypeAtChunkCoords(chunkX, chunkY) {
    const ix = chunkX + HALF_CHUNKS;
    const iy = chunkY + HALF_CHUNKS;

    if (!inChunkBounds(ix, iy)) {
      return null;
    }

    return chunkTypes[chunkIndex(ix, iy)];
  }

  function chunkTypeAtTile(tileX, tileY) {
    return chunkTypeAtChunkCoords(tileToChunkCoord(tileX), tileToChunkCoord(tileY));
  }

  function getObject(tileX, tileY) {
    if (!inTileBounds(tileX, tileY)) {
      return null;
    }

    return objects.get(objectKey(tileX, tileY)) ?? null;
  }

  function getObjectById(id) {
    return objectsById.get(id) ?? null;
  }

  function pointInsideWallSegmentLocal(localX, localY, connections) {
    if (localX < 0 || localY < 0 || localX > 1 || localY > 1) {
      return false;
    }

    const half = WALL_SEGMENT_THICKNESS * 0.5;
    const centeredX = Math.abs(localX - 0.5) <= half;
    const centeredY = Math.abs(localY - 0.5) <= half;

    if (centeredX && centeredY) {
      return true;
    }

    if ((connections & WALL_CONNECTION_N) && centeredX && localY <= 0.5 + half) {
      return true;
    }
    if ((connections & WALL_CONNECTION_S) && centeredX && localY >= 0.5 - half) {
      return true;
    }
    if ((connections & WALL_CONNECTION_E) && centeredY && localX >= 0.5 - half) {
      return true;
    }
    if ((connections & WALL_CONNECTION_W) && centeredY && localX <= 0.5 + half) {
      return true;
    }

    return false;
  }

  function pointInsideObjectLocal(object, localX, localY) {
    if (object.type === ObjectType.WALL_SEGMENT) {
      return pointInsideWallSegmentLocal(localX, localY, object.data.connections ?? 0);
    }

    if (object.type === ObjectType.DOOR) {
      if (object.data?.open) {
        return false;
      }

      const axis = object.data?.axis === "y" ? "y" : "x";
      const centeredX = Math.abs(localX - 0.5);
      const centeredY = Math.abs(localY - 0.5);
      if (axis === "x") {
        return centeredX <= DOOR_HALF_LENGTH && centeredY <= DOOR_HALF_THICKNESS;
      }

      return centeredY <= DOOR_HALF_LENGTH && centeredX <= DOOR_HALF_THICKNESS;
    }

    if (object.type === ObjectType.SMALL_CHEST) {
      return (
        Math.abs(localX - 0.5) <= CHEST_HALF_EXTENT &&
        Math.abs(localY - 0.5) <= CHEST_HALF_EXTENT
      );
    }

    if (
      object.type === ObjectType.SMELTER ||
      object.type === ObjectType.STONE_CUTTER ||
      object.type === ObjectType.CONSTRUCTION_BENCH ||
      object.type === ObjectType.STOVE
    ) {
      return (
        Math.abs(localX - 0.5) <= BENCH_HALF_EXTENT &&
        Math.abs(localY - 0.5) <= BENCH_HALF_EXTENT
      );
    }

    return false;
  }

  function objectAtPoint(pointX, pointY, predicate) {
    const tileX = Math.floor(pointX);
    const tileY = Math.floor(pointY);
    const object = getObject(tileX, tileY);
    if (!object || !predicate(object)) {
      return null;
    }

    const localX = pointX - tileX;
    const localY = pointY - tileY;
    return pointInsideObjectLocal(object, localX, localY) ? object : null;
  }

  function sampleOpaqueAtPoint(pointX, pointY) {
    const tileX = Math.floor(pointX);
    const tileY = Math.floor(pointY);

    if (!inTileBounds(tileX, tileY)) {
      return {
        opaque: true,
        tileX,
        tileY,
        kind: "void",
        object: null,
        heightScale: 1,
      };
    }

    if (getTile(tileX, tileY) === TileType.WALL) {
      return {
        opaque: true,
        tileX,
        tileY,
        kind: "tile-wall",
        object: null,
        heightScale: 1,
      };
    }

    const object = objectAtPoint(pointX, pointY, (candidate) => candidate.blocksVision);
    if (object) {
      return {
        opaque: true,
        tileX,
        tileY,
        kind: "object",
        object,
        heightScale: object.type === ObjectType.WALL_SEGMENT ? 0.74 : 0.86,
      };
    }

    return {
      opaque: false,
      tileX,
      tileY,
      kind: "none",
      object: null,
      heightScale: 1,
    };
  }

  function isPointOpaque(pointX, pointY) {
    return sampleOpaqueAtPoint(pointX, pointY).opaque;
  }

  function isPointBlocked(pointX, pointY) {
    const tileX = Math.floor(pointX);
    const tileY = Math.floor(pointY);
    if (!inTileBounds(tileX, tileY)) {
      return true;
    }

    if (getTile(tileX, tileY) === TileType.WALL) {
      return true;
    }

    return Boolean(objectAtPoint(pointX, pointY, (candidate) => candidate.blocksMovement));
  }

  function isTileWalkableByBase(tileX, tileY) {
    return getTile(tileX, tileY) === TileType.FLOOR;
  }

  function isWalkableTile(tileX, tileY) {
    if (!isTileWalkableByBase(tileX, tileY)) {
      return false;
    }

    const object = getObject(tileX, tileY);
    return !object || !object.blocksMovement;
  }

  function isOpaqueTile(tileX, tileY) {
    return isPointOpaque(tileX + 0.5, tileY + 0.5);
  }

  function recalcWallSegmentAt(tileX, tileY) {
    const object = getObject(tileX, tileY);
    if (!object || object.type !== ObjectType.WALL_SEGMENT) {
      return;
    }

    const linksToWallChain = (candidate) =>
      candidate?.type === ObjectType.WALL_SEGMENT || candidate?.type === ObjectType.DOOR;

    let connections = 0;

    if (linksToWallChain(getObject(tileX, tileY - 1))) {
      connections |= WALL_CONNECTION_N;
    }
    if (linksToWallChain(getObject(tileX + 1, tileY))) {
      connections |= WALL_CONNECTION_E;
    }
    if (linksToWallChain(getObject(tileX, tileY + 1))) {
      connections |= WALL_CONNECTION_S;
    }
    if (linksToWallChain(getObject(tileX - 1, tileY))) {
      connections |= WALL_CONNECTION_W;
    }

    object.data.connections = connections;
  }

  function recalcWallSegmentNeighbors(tileX, tileY) {
    recalcWallSegmentAt(tileX, tileY);
    recalcWallSegmentAt(tileX, tileY - 1);
    recalcWallSegmentAt(tileX + 1, tileY);
    recalcWallSegmentAt(tileX, tileY + 1);
    recalcWallSegmentAt(tileX - 1, tileY);
  }

  function resolveDoorAxis(tileX, tileY, preferredAxis) {
    if (preferredAxis === "x" || preferredAxis === "y") {
      return preferredAxis;
    }

    const north = getObject(tileX, tileY - 1)?.type === ObjectType.WALL_SEGMENT;
    const east = getObject(tileX + 1, tileY)?.type === ObjectType.WALL_SEGMENT;
    const south = getObject(tileX, tileY + 1)?.type === ObjectType.WALL_SEGMENT;
    const west = getObject(tileX - 1, tileY)?.type === ObjectType.WALL_SEGMENT;

    const hasNorthSouth = north || south;
    const hasEastWest = east || west;

    if (hasEastWest && !hasNorthSouth) {
      return "x";
    }
    if (hasNorthSouth && !hasEastWest) {
      return "y";
    }

    const northWall = getTile(tileX, tileY - 1) === TileType.WALL;
    const eastWall = getTile(tileX + 1, tileY) === TileType.WALL;
    const southWall = getTile(tileX, tileY + 1) === TileType.WALL;
    const westWall = getTile(tileX - 1, tileY) === TileType.WALL;

    const wallNorthSouth = northWall || southWall;
    const wallEastWest = eastWall || westWall;

    if (wallEastWest && !wallNorthSouth) {
      return "x";
    }
    if (wallNorthSouth && !wallEastWest) {
      return "y";
    }

    return "x";
  }

  function syncDoorBlockingState(object) {
    if (!object || object.type !== ObjectType.DOOR) {
      return;
    }

    const open = !!object.data?.open;
    object.blocksMovement = !open;
    object.blocksVision = !open;
  }

  function placeObject(tileX, tileY, type, data = {}) {
    if (!inTileBounds(tileX, tileY)) {
      return null;
    }

    if (getTile(tileX, tileY) !== TileType.FLOOR || getObject(tileX, tileY)) {
      return null;
    }

    const objectData = { ...data };
    if (
      (type === ObjectType.SMELTER ||
        type === ObjectType.STONE_CUTTER ||
        type === ObjectType.CONSTRUCTION_BENCH ||
        type === ObjectType.STOVE) &&
      !Array.isArray(objectData.ingredients)
    ) {
      objectData.ingredients = [];
    }
    if (type === ObjectType.SMALL_CHEST && !Array.isArray(objectData.slots)) {
      objectData.slots = Array(12).fill(null);
    }
    if (type === ObjectType.WALL_SEGMENT && typeof objectData.connections !== "number") {
      objectData.connections = 0;
    }
    if (type === ObjectType.DOOR && !["x", "y"].includes(objectData.axis)) {
      objectData.axis = resolveDoorAxis(tileX, tileY, objectData.axis);
    }
    if (type === ObjectType.DOOR && typeof objectData.open !== "boolean") {
      objectData.open = false;
    }

    const object = {
      id: nextObjectId,
      type,
      tileX,
      tileY,
      blocksMovement:
        type === ObjectType.SMELTER ||
        type === ObjectType.STONE_CUTTER ||
        type === ObjectType.CONSTRUCTION_BENCH ||
        type === ObjectType.STOVE ||
        type === ObjectType.SMALL_CHEST ||
        type === ObjectType.WALL_SEGMENT ||
        (type === ObjectType.DOOR && !objectData.open),
      blocksVision: type === ObjectType.WALL_SEGMENT || (type === ObjectType.DOOR && !objectData.open),
      data: objectData,
    };

    syncDoorBlockingState(object);

    nextObjectId += 1;
    objects.set(objectKey(tileX, tileY), object);
    objectsById.set(object.id, object);

    if (type === ObjectType.WALL_SEGMENT || type === ObjectType.DOOR) {
      recalcWallSegmentNeighbors(tileX, tileY);
    }

    return object;
  }

  function removeObject(tileX, tileY) {
    const object = getObject(tileX, tileY);
    if (!object) {
      return null;
    }

    objects.delete(objectKey(tileX, tileY));
    objectsById.delete(object.id);

    if (object.type === ObjectType.WALL_SEGMENT || object.type === ObjectType.DOOR) {
      recalcWallSegmentNeighbors(tileX, tileY);
    }

    return object;
  }

  function setDoorOpen(tileX, tileY, open) {
    const object = getObject(tileX, tileY);
    if (!object || object.type !== ObjectType.DOOR) {
      return null;
    }

    object.data.open = !!open;
    syncDoorBlockingState(object);
    return object;
  }

  function toggleDoor(tileX, tileY) {
    const object = getObject(tileX, tileY);
    if (!object || object.type !== ObjectType.DOOR) {
      return null;
    }

    object.data.open = !object.data.open;
    syncDoorBlockingState(object);
    return object;
  }

  function forEachObject(callback) {
    for (const object of objects.values()) {
      callback(object);
    }
  }

  function forEachObjectNear(centerX, centerY, radius, callback) {
    for (const object of objects.values()) {
      if (Math.abs(object.tileX - centerX) > radius || Math.abs(object.tileY - centerY) > radius) {
        continue;
      }

      callback(object);
    }
  }

  function isCavernTile(tileX, tileY) {
    return chunkTypeAtTile(tileX, tileY) === ChunkType.CAVERN;
  }

  for (const pending of pendingObjects) {
    placeObject(pending.tileX, pending.tileY, pending.type, pending.data);
  }

  return {
    seed,
    tiles,
    chunkTypes,
    worldTiles: WORLD_TILES,
    chunkTiles: CHUNK_TILES,
    getTile,
    setTile,
    chunkTypeAtTile,
    chunkTypeAtChunkCoords,
    isWalkableTile,
    isOpaqueTile,
    isPointBlocked,
    isPointOpaque,
    sampleOpaqueAtPoint,
    inTileBounds,
    tileToChunkCoord,
    getObject,
    getObjectById,
    placeObject,
    removeObject,
    setDoorOpen,
    toggleDoor,
    forEachObject,
    forEachObjectNear,
    isTileWalkableByBase,
    isCavernTile,
  };
}


