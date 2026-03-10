import { ChunkType, FOV, MAX_VIEW_DISTANCE, ObjectType, ResourceId, TileType, ToolId } from "./config.js";

const CUBE_FACE_DEFS = [
  { indices: [4, 5, 7, 6], shade: 1.0 },
  { indices: [0, 1, 3, 2], shade: 0.56 },
  { indices: [0, 2, 6, 4], shade: 0.76 },
  { indices: [1, 3, 7, 5], shade: 0.86 },
  { indices: [2, 3, 7, 6], shade: 0.94 },
  { indices: [0, 1, 5, 4], shade: 0.68 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let next = angle;
  while (next < -Math.PI) {
    next += Math.PI * 2;
  }
  while (next > Math.PI) {
    next -= Math.PI * 2;
  }
  return next;
}

function parseHexColor(hex) {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function shadeHexColor(hex, shade) {
  const rgb = parseHexColor(hex);
  return `rgb(${Math.floor(rgb.r * shade)} ${Math.floor(rgb.g * shade)} ${Math.floor(rgb.b * shade)})`;
}

function rotatePoint(point, rotX, rotY, rotZ) {
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cz = Math.cos(rotZ);
  const sz = Math.sin(rotZ);

  const rx = {
    x: point.x,
    y: point.y * cx - point.z * sx,
    z: point.y * sx + point.z * cx,
  };

  const ry = {
    x: rx.x * cy + rx.z * sy,
    y: rx.y,
    z: -rx.x * sy + rx.z * cy,
  };

  return {
    x: ry.x * cz - ry.y * sz,
    y: ry.x * sz + ry.y * cz,
    z: ry.z,
  };
}

function projectViewPoint(point, width, height, camera) {
  const z = point.z + camera.zOffset;
  if (z <= 0.06) {
    return null;
  }

  const scale = camera.scale / z;
  return {
    x: width * camera.centerX + point.x * scale,
    y: height * camera.centerY - point.y * scale,
    z,
  };
}

function drawCuboid(ctx, cuboid, camera, width, height) {
  const hx = cuboid.size.x * 0.5;
  const hy = cuboid.size.y * 0.5;
  const hz = cuboid.size.z * 0.5;

  const localVertices = [
    { x: -hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: -hz },
    { x: -hx, y: hy, z: -hz },
    { x: hx, y: hy, z: -hz },
    { x: -hx, y: -hy, z: hz },
    { x: hx, y: -hy, z: hz },
    { x: -hx, y: hy, z: hz },
    { x: hx, y: hy, z: hz },
  ];

  const worldVertices = localVertices.map((vertex) => {
    const rotated = rotatePoint(vertex, cuboid.rot.x, cuboid.rot.y, cuboid.rot.z);
    return {
      x: rotated.x + cuboid.pos.x,
      y: rotated.y + cuboid.pos.y,
      z: rotated.z + cuboid.pos.z,
    };
  });

  const projected = worldVertices.map((vertex) => projectViewPoint(vertex, width, height, camera));
  if (projected.some((vertex) => !vertex)) {
    return;
  }

  const faces = CUBE_FACE_DEFS.map((faceDef) => {
    const depth =
      (projected[faceDef.indices[0]].z +
        projected[faceDef.indices[1]].z +
        projected[faceDef.indices[2]].z +
        projected[faceDef.indices[3]].z) /
      4;
    return {
      indices: faceDef.indices,
      shade: faceDef.shade,
      depth,
    };
  }).sort((a, b) => b.depth - a.depth);

  for (const face of faces) {
    ctx.fillStyle = shadeHexColor(cuboid.color, face.shade);
    ctx.beginPath();

    let moved = false;
    for (const index of face.indices) {
      const vertex = projected[index];
      if (!vertex) {
        continue;
      }

      if (!moved) {
        ctx.moveTo(vertex.x, vertex.y);
        moved = true;
      } else {
        ctx.lineTo(vertex.x, vertex.y);
      }
    }

    if (!moved) {
      continue;
    }

    ctx.closePath();
    ctx.fill();
  }
}

function transformWorldPointToCamera(worldPoint, player) {
  const offsetX = worldPoint.x - player.x;
  const offsetY = worldPoint.y - player.y;
  const offsetZ = worldPoint.z - (player.eyeHeight ?? 0.58);

  const sin = Math.sin(player.angle);
  const cos = Math.cos(player.angle);

  return {
    x: -offsetX * sin + offsetY * cos,
    y: offsetZ,
    z: offsetX * cos + offsetY * sin,
  };
}

function projectCameraPoint(cameraPoint, projection, width, height) {
  if (cameraPoint.z <= 0.01) {
    return null;
  }

  const scale = projection / cameraPoint.z;
  return {
    x: width * 0.5 + cameraPoint.x * scale,
    y: height * 0.5 - cameraPoint.y * scale,
    z: cameraPoint.z,
  };
}

function clipPolygonNearPlane(cameraVertices, nearZ) {
  if (!cameraVertices.length) {
    return [];
  }

  const clipped = [];
  let previous = cameraVertices[cameraVertices.length - 1];
  let previousInside = previous.z > nearZ;

  for (const current of cameraVertices) {
    const currentInside = current.z > nearZ;

    if (currentInside !== previousInside) {
      const t = (nearZ - previous.z) / (current.z - previous.z);
      clipped.push({
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
        z: nearZ,
      });
    }

    if (currentInside) {
      clipped.push(current);
    }

    previous = current;
    previousInside = currentInside;
  }

  return clipped;
}

function collectWorldCuboidFaces(cuboid, player, projection, width, height, wallDepthBuffer) {
  const nearZ = 0.01;
  const hx = cuboid.size.x * 0.5;
  const hy = cuboid.size.y * 0.5;
  const hz = cuboid.size.z * 0.5;

  const localVertices = [
    { x: -hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: -hz },
    { x: -hx, y: hy, z: -hz },
    { x: hx, y: hy, z: -hz },
    { x: -hx, y: -hy, z: hz },
    { x: hx, y: -hy, z: hz },
    { x: -hx, y: hy, z: hz },
    { x: hx, y: hy, z: hz },
  ];

  const worldVertices = localVertices.map((vertex) => {
    const rotated = rotatePoint(vertex, cuboid.rot.x, cuboid.rot.y, cuboid.rot.z);
    return {
      x: cuboid.pos.x + rotated.x,
      y: cuboid.pos.y + rotated.y,
      z: cuboid.pos.z + rotated.z,
    };
  });

  const cameraVertices = worldVertices.map((vertex) => transformWorldPointToCamera(vertex, player));
  if (cameraVertices.every((vertex) => vertex.z <= nearZ)) {
    return [];
  }

  return CUBE_FACE_DEFS.map((faceDef) => {
    const faceCameraVertices = faceDef.indices.map((index) => cameraVertices[index]);
    const clippedFaceVertices = clipPolygonNearPlane(faceCameraVertices, nearZ);
    if (clippedFaceVertices.length < 3) {
      return null;
    }

    const projectedPoints = clippedFaceVertices
      .map((vertex) => projectCameraPoint(vertex, projection, width, height))
      .filter(Boolean);
    if (projectedPoints.length < 3) {
      return null;
    }

    const nearestDepth = Math.min(...clippedFaceVertices.map((vertex) => vertex.z));
    const averageDepth =
      clippedFaceVertices.reduce((sum, vertex) => sum + vertex.z, 0) / clippedFaceVertices.length;
    const shadeStrength = clamp(cuboid.shadeStrength ?? 1, 0, 1);
    const faceShade = 1 + (faceDef.shade - 1) * shadeStrength;

    const minX = clamp(Math.floor(Math.min(...projectedPoints.map((point) => point.x))), 0, width - 1);
    const maxX = clamp(Math.ceil(Math.max(...projectedPoints.map((point) => point.x))), 0, width - 1);
    if (wallDepthBuffer) {
      let visibleColumns = 0;
      const occlusionDepth = Math.max(nearZ, averageDepth - 0.004);
      for (let column = minX; column <= maxX; column += 1) {
        if (occlusionDepth <= wallDepthBuffer[column] + 0.002) {
          visibleColumns += 1;
        }
      }
      if (visibleColumns === 0) {
        return null;
      }
    }

    return {
      points: projectedPoints,
      color: cuboid.color,
      shade: faceShade,
      depth: averageDepth,
      nearestDepth,
      minX,
      maxX,
    };
  }).filter(Boolean);
}

function drawWorldFace(ctx, face) {
  ctx.fillStyle = shadeHexColor(face.color, face.shade);
  ctx.beginPath();
  ctx.moveTo(face.points[0].x, face.points[0].y);
  for (let i = 1; i < face.points.length; i += 1) {
    ctx.lineTo(face.points[i].x, face.points[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

function castRay(world, originX, originY, rayAngle, maxDistance) {
  const dirX = Math.cos(rayAngle);
  const dirY = Math.sin(rayAngle);
  const step = 0.025;

  for (let distance = step; distance <= maxDistance; distance += step) {
    const sampleX = originX + dirX * distance;
    const sampleY = originY + dirY * distance;
    const sample = world.sampleOpaqueAtPoint(sampleX, sampleY);

    if (sample.opaque) {
      let near = Math.max(0, distance - step);
      let far = distance;
      let refinedSample = sample;

      for (let i = 0; i < 6; i += 1) {
        const mid = (near + far) * 0.5;
        const midSampleX = originX + dirX * mid;
        const midSampleY = originY + dirY * mid;
        const midSample = world.sampleOpaqueAtPoint(midSampleX, midSampleY);

        if (midSample.opaque) {
          far = mid;
          refinedSample = midSample;
        } else {
          near = mid;
        }
      }

      const hitDistance = Math.max(far, 0.001);
      return {
        hit: true,
        distance: hitDistance,
        hitX: originX + dirX * hitDistance,
        hitY: originY + dirY * hitDistance,
        tileX: refinedSample.tileX,
        tileY: refinedSample.tileY,
        object: refinedSample.object,
        heightScale: refinedSample.heightScale ?? 1,
      };
    }
  }

  return {
    hit: false,
    distance: maxDistance,
    hitX: originX + dirX * maxDistance,
    hitY: originY + dirY * maxDistance,
    tileX: Math.floor(originX + dirX * maxDistance),
    tileY: Math.floor(originY + dirY * maxDistance),
    object: null,
    heightScale: 1,
  };
}

function hashNoise2D(ix, iy, seed = 0) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep01(x - x0);
  const ty = smoothstep01(y - y0);

  const n00 = hashNoise2D(x0, y0, seed);
  const n10 = hashNoise2D(x0 + 1, y0, seed);
  const n01 = hashNoise2D(x0, y0 + 1, seed);
  const n11 = hashNoise2D(x0 + 1, y0 + 1, seed);

  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

function wallTextureShade(world, hit) {
  const localX = hit.hitX - Math.floor(hit.hitX);
  const localY = hit.hitY - Math.floor(hit.hitY);

  const edgeX = Math.min(localX, 1 - localX);
  const edgeY = Math.min(localY, 1 - localY);
  const seamCoord = Math.max(edgeX, edgeY);
  const seamShade = seamCoord < 0.06 ? 0.94 : seamCoord < 0.11 ? 0.985 : 1;

  const chunkType = world.chunkTypeAtTile(hit.tileX, hit.tileY);
  const typeBias =
    hit.object?.type === ObjectType.WALL_SEGMENT
      ? 1.05
      : chunkType === ChunkType.DUNGEON
        ? 0.95
        : 1.02;

  const rotatedA = hit.hitX * 1.31 + hit.hitY * 0.97;
  const rotatedB = hit.hitY * 1.27 - hit.hitX * 0.93;
  const macroNoise = valueNoise2D(rotatedA * 1.2, rotatedB * 1.2, 1) - 0.5;
  const detailNoise = valueNoise2D(rotatedA * 4.6 + 7.1, rotatedB * 4.6 - 5.4, 2) - 0.5;
  const speckleNoise = valueNoise2D(rotatedA * 11.7 - 3.8, rotatedB * 11.7 + 9.6, 3) - 0.5;
  const tileVariance = (hashNoise2D(hit.tileX, hit.tileY, 4) - 0.5) * 0.04;
  const checker = ((hit.tileX + hit.tileY) & 1) === 0 ? 0.006 : -0.006;

  const noiseShade = 1 + macroNoise * 0.12 + detailNoise * 0.06 + speckleNoise * 0.02 + tileVariance + checker;
  return clamp(noiseShade * seamShade * typeBias, 0.82, 1.08);
}

function pickWallColor(world, hit, shade) {
  let r = 75;
  let g = 84;
  let b = 94;

  if (hit.object?.type === ObjectType.WALL_SEGMENT) {
    r = 198;
    g = 208;
    b = 220;
  } else {
    const chunkType = world.chunkTypeAtTile(hit.tileX, hit.tileY);
    if (chunkType === ChunkType.DUNGEON) {
      r = 124;
      g = 84;
      b = 64;
    } else {
      r = 68;
      g = 78;
      b = 92;
    }
  }

  const textureShade = wallTextureShade(world, hit);
  const finalShade = clamp(shade * textureShade, 0.15, 1.1);
  return `rgb(${Math.floor(r * finalShade)} ${Math.floor(g * finalShade)} ${Math.floor(b * finalShade)})`;
}

function oreVisualsForResource(resourceId) {
  if (resourceId === ResourceId.ZINC_ORE) {
    return {
      color: "#93a2b1",
      outline: "#d3dfeb",
      glow: "rgba(177, 199, 224, 0.2)",
      minimap: "#bdd0e2",
    };
  }

  if (resourceId === ResourceId.IRON_ORE) {
    return {
      color: "#8f6653",
      outline: "#d0a189",
      glow: "rgba(206, 151, 120, 0.22)",
      minimap: "#cc9376",
    };
  }

  return {
    color: "#c48a2f",
    outline: "#f8c96b",
    glow: "rgba(245, 180, 88, 0.18)",
    minimap: "#e0a756",
  };
}

function pickupVisualsForResource(resourceId) {
  if (resourceId === ResourceId.COPPER_COIN) {
    return {
      color: "#c58a4f",
      outline: "#f1c17f",
      glow: "rgba(217, 152, 89, 0.22)",
      minimap: "#d9a168",
    };
  }

  if (resourceId === ResourceId.SILVER_COIN) {
    return {
      color: "#aab4be",
      outline: "#dde5ed",
      glow: "rgba(189, 201, 214, 0.2)",
      minimap: "#c9d4de",
    };
  }

  if (resourceId === ResourceId.GOLD_COIN) {
    return {
      color: "#cfaa4a",
      outline: "#f6de8e",
      glow: "rgba(244, 215, 121, 0.24)",
      minimap: "#f2cb63",
    };
  }

  if (resourceId === ResourceId.MEAT) {
    return {
      color: "#b47263",
      outline: "#e4b3a8",
      glow: "rgba(222, 156, 140, 0.2)",
      minimap: "#d4988b",
    };
  }

  if (resourceId === ResourceId.SIMPLE_STEW) {
    return {
      color: "#7ea38f",
      outline: "#cfe7d6",
      glow: "rgba(166, 212, 180, 0.2)",
      minimap: "#a8d4b8",
    };
  }

  return {
    color: "#8cb1c6",
    outline: "#d5ebf8",
    glow: "rgba(177, 211, 230, 0.2)",
    minimap: "#aad0e2",
  };
}

function spriteStyleForObject(object) {
  if (object.type === ObjectType.ORE_NODE) {
    const oreVisual = oreVisualsForResource(object.data?.resourceId);
    return {
      color: oreVisual.color,
      outline: oreVisual.outline,
      glow: oreVisual.glow,
      scale: 0.48,
      widthScale: 0.76,
      anchor: "floor",
    };
  }

  if (object.type === ObjectType.WOODY_ROOT) {
    return {
      color: "#7d5f45",
      outline: "#b38a64",
      scale: 0.72,
      widthScale: 0.28,
      hang: clamp(object.data?.hang ?? 1.2, 0.85, 1.9),
      anchor: "ceiling",
    };
  }

  if (object.type === ObjectType.MUSHROOM) {
    return {
      color: "#9f7860",
      outline: "#e6c8ac",
      glow: "rgba(230, 195, 155, 0.16)",
      scale: 0.38 + clamp(object.data?.capScale ?? 1, 0.7, 1.3) * 0.14,
      widthScale: 0.82,
      anchor: "floor",
    };
  }

  if (object.type === ObjectType.PICKUP) {
    const pickupVisual = pickupVisualsForResource(object.data?.resourceId);
    return {
      color: pickupVisual.color,
      outline: pickupVisual.outline,
      glow: pickupVisual.glow,
      scale: 0.34,
      widthScale: 0.8,
      anchor: "floor",
    };
  }

  return { color: "#909090", outline: "#f0f0f0", scale: 0.7, widthScale: 0.9, anchor: "floor" };
}

function drawOreNode(ctx, x, y, width, height, style, highlighted) {
  const bodyColor = highlighted ? "#ffd276" : style.color;
  const glowColor = highlighted ? "rgba(255, 227, 136, 0.25)" : (style.glow ?? "rgba(245, 180, 88, 0.18)");

  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.95, width * 0.36, height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = Math.max(1, width * 0.04);

  const crystal = (ox, oy, scale = 1) => {
    const cw = width * 0.23 * scale;
    const ch = height * 0.54 * scale;
    const cx = x + ox;
    const cy = y + oy;

    ctx.beginPath();
    ctx.moveTo(cx, cy - ch * 0.5);
    ctx.lineTo(cx + cw * 0.5, cy + ch * 0.15);
    ctx.lineTo(cx, cy + ch * 0.5);
    ctx.lineTo(cx - cw * 0.5, cy + ch * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  crystal(width * 0.42, height * 0.56, 1.0);
  crystal(width * 0.26, height * 0.66, 0.72);
  crystal(width * 0.58, height * 0.71, 0.68);
}

function drawWorkbench(ctx, x, y, width, height, style, highlighted, construction = false) {
  const body = highlighted ? "#9bc7d6" : style.color;
  const top = construction ? "#4f7a8a" : "#7b6360";

  ctx.fillStyle = "rgba(12, 12, 16, 0.25)";
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.96, width * 0.42, height * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = Math.max(1, width * 0.03);

  ctx.fillRect(x + width * 0.1, y + height * 0.35, width * 0.8, height * 0.58);
  ctx.strokeRect(x + width * 0.1, y + height * 0.35, width * 0.8, height * 0.58);

  ctx.fillStyle = top;
  ctx.fillRect(x + width * 0.05, y + height * 0.23, width * 0.9, height * 0.14);

  if (!construction) {
    ctx.fillStyle = highlighted ? "#ffbe89" : "#7d6a6a";
    ctx.fillRect(x + width * 0.65, y + height * 0.03, width * 0.17, height * 0.32);
  } else {
    ctx.fillStyle = "#c9dfe8";
    ctx.fillRect(x + width * 0.18, y + height * 0.14, width * 0.2, height * 0.1);
    ctx.fillRect(x + width * 0.48, y + height * 0.14, width * 0.2, height * 0.1);
  }
}

function drawWoodyRoots(ctx, x, y, width, height, style, highlighted) {
  const rootColor = highlighted ? "#d2ab82" : style.color;
  const rootOutline = highlighted ? "#f3d2ab" : style.outline;

  ctx.fillStyle = "rgba(12, 12, 16, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.98, width * 0.25, height * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  const strandCount = 5;
  const lineWidth = Math.max(1, width * 0.12);
  for (let i = 0; i < strandCount; i += 1) {
    const t = (i + 0.5) / strandCount;
    const sx = x + width * (0.2 + t * 0.6);
    const sy = y;
    const ex = sx + (t - 0.5) * width * 0.55;
    const ey = y + height * (0.82 + (i % 2) * 0.08);
    const cx = (sx + ex) * 0.5 + (0.5 - t) * width * 0.28;
    const cy = y + height * 0.52;

    ctx.strokeStyle = rootOutline;
    ctx.lineWidth = lineWidth + (i % 2 === 0 ? 0.5 : 0);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();

    ctx.strokeStyle = rootColor;
    ctx.lineWidth = Math.max(1, lineWidth * 0.58);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
  }
}

function drawMushroom(ctx, x, y, width, height, style, highlighted) {
  const stemColor = highlighted ? "#f2ddc4" : "#d6c2aa";
  const capColor = highlighted ? "#c79b79" : style.color;
  const capOutline = highlighted ? "#f0d2b2" : style.outline;

  ctx.fillStyle = highlighted ? "rgba(232, 196, 150, 0.24)" : (style.glow ?? "rgba(230, 195, 155, 0.16)");
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, y + height * 0.95, width * 0.33, height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = stemColor;
  ctx.fillRect(x + width * 0.43, y + height * 0.54, width * 0.14, height * 0.34);

  ctx.fillStyle = capColor;
  ctx.strokeStyle = capOutline;
  ctx.lineWidth = Math.max(1, width * 0.045);
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, y + height * 0.52, width * 0.34, height * 0.2, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPickup(ctx, x, y, width, height, style, highlighted) {
  const fillColor = highlighted ? "#f8edbf" : style.color;
  const rimColor = highlighted ? "#fff6d0" : style.outline;

  ctx.fillStyle = highlighted ? "rgba(255, 224, 120, 0.22)" : style.glow;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.94, width * 0.36, height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  const coinW = width * 0.42;
  const coinH = height * 0.26;
  const centerX = x + width * 0.5;
  const centerY = y + height * 0.58;

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = Math.max(1, width * 0.04);

  const drawCoin = (offsetX, offsetY, scale = 1) => {
    ctx.beginPath();
    ctx.ellipse(
      centerX + offsetX,
      centerY + offsetY,
      coinW * 0.5 * scale,
      coinH * 0.5 * scale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  };

  drawCoin(-width * 0.11, height * 0.08, 0.9);
  drawCoin(width * 0.03, 0, 1.0);
  drawCoin(width * 0.15, height * 0.07, 0.84);
}

function drawObjectSprite(ctx, object, drawData) {
  const style = spriteStyleForObject(object);

  if (object.type === ObjectType.ORE_NODE) {
    drawOreNode(ctx, drawData.x, drawData.y, drawData.width, drawData.height, style, drawData.highlighted);
    return;
  }

  if (object.type === ObjectType.WOODY_ROOT) {
    drawWoodyRoots(ctx, drawData.x, drawData.y, drawData.width, drawData.height, style, drawData.highlighted);
    return;
  }

  if (object.type === ObjectType.MUSHROOM) {
    drawMushroom(ctx, drawData.x, drawData.y, drawData.width, drawData.height, style, drawData.highlighted);
    return;
  }

  if (object.type === ObjectType.PICKUP) {
    drawPickup(ctx, drawData.x, drawData.y, drawData.width, drawData.height, style, drawData.highlighted);
  }
}

function benchModelParts(object, highlighted) {
  const baseX = object.tileX + 0.5;
  const baseY = object.tileY + 0.5;


  if (object.type === ObjectType.DOOR) {
    const axis = object.data?.axis === "y" ? "y" : "x";
    const open = !!object.data?.open;
    const frameShift = 0.46;
    const frameOffsetA = axis === "x" ? { x: -frameShift, y: 0 } : { x: 0, y: -frameShift };
    const frameOffsetB = axis === "x" ? { x: frameShift, y: 0 } : { x: 0, y: frameShift };
    const frameThicknessX = axis === "x" ? 0.08 : 0.24;
    const frameThicknessY = axis === "y" ? 0.08 : 0.24;

    const closedPanel = {
      x: baseX,
      y: baseY,
      w: axis === "x" ? 0.84 : 0.08,
      h: axis === "y" ? 0.84 : 0.08,
    };

    const openShift = 0.34;
    const openPanel = axis === "x"
      ? { x: baseX + openShift, y: baseY, w: 0.08, h: 0.84 }
      : { x: baseX, y: baseY + openShift, w: 0.84, h: 0.08 };

    const panel = open ? openPanel : closedPanel;
    const beamWidth = axis === "x" ? 0.92 : 0.24;
    const beamHeight = axis === "y" ? 0.92 : 0.24;

    return [
      {
        color: highlighted ? "#7c9db0" : "#6b8899",
        pos: { x: panel.x, y: panel.y, z: 0.35 },
        size: { x: panel.w, y: panel.h, z: 0.7 },
        rot: { x: 0, y: 0, z: 0 },
      },
      {
        color: highlighted ? "#afc1ce" : "#8ea3b2",
        pos: { x: baseX + frameOffsetA.x, y: baseY + frameOffsetA.y, z: 0.33 },
        size: { x: frameThicknessX, y: frameThicknessY, z: 0.66 },
        rot: { x: 0, y: 0, z: 0 },
      },
      {
        color: highlighted ? "#afc1ce" : "#8ea3b2",
        pos: { x: baseX + frameOffsetB.x, y: baseY + frameOffsetB.y, z: 0.33 },
        size: { x: frameThicknessX, y: frameThicknessY, z: 0.66 },
        rot: { x: 0, y: 0, z: 0 },
      },
      {
        color: highlighted ? "#d5e4ee" : "#afc1ce",
        pos: { x: baseX, y: baseY, z: 0.68 },
        size: { x: beamWidth, y: beamHeight, z: 0.08 },
        rot: { x: 0, y: 0, z: 0 },
      },
    ];
  }

  if (object.type === ObjectType.SMALL_CHEST) {
    const bodyColor = highlighted ? "#a08058" : "#8b6b46";
    const lidColor = highlighted ? "#c9ae83" : "#b69668";
    const trimColor = highlighted ? "#d9c8a4" : "#c2ad82";
    return [
      {
        color: bodyColor,
        pos: { x: baseX, y: baseY, z: 0.17 },
        size: { x: 0.56, y: 0.4, z: 0.2 },
        rot: { x: 0, y: 0, z: 0 },
      },
      {
        color: lidColor,
        pos: { x: baseX, y: baseY, z: 0.32 },
        size: { x: 0.62, y: 0.44, z: 0.09 },
        rot: { x: 0, y: 0, z: 0 },
      },
      {
        color: trimColor,
        pos: { x: baseX + 0.22, y: baseY, z: 0.17 },
        size: { x: 0.04, y: 0.16, z: 0.12 },
        rot: { x: 0, y: 0, z: 0 },
      },
    ];
  }

  if (object.type !== ObjectType.STONE_CUTTER && object.type !== ObjectType.SMELTER && object.type !== ObjectType.STOVE && object.type !== ObjectType.CONSTRUCTION_BENCH) {
    return [];
  }

  let bodyColor = highlighted ? "#648293" : "#577282";
  let topColor = highlighted ? "#96bfd1" : "#82adc0";

  if (object.type === ObjectType.STONE_CUTTER) {
    bodyColor = highlighted ? "#81919b" : "#6f7e87";
    topColor = highlighted ? "#b1c6d1" : "#9bb3bf";
  } else if (object.type === ObjectType.SMELTER) {
    bodyColor = highlighted ? "#8f6e67" : "#7e5f59";
    topColor = highlighted ? "#be9689" : "#a78378";
  } else if (object.type === ObjectType.STOVE) {
    bodyColor = highlighted ? "#7f7b72" : "#6b675f";
    topColor = highlighted ? "#a79f92" : "#918a7e";
  }

  const legs = [
    { x: -0.25, y: -0.15 },
    { x: 0.25, y: -0.15 },
    { x: -0.25, y: 0.15 },
    { x: 0.25, y: 0.15 },
  ];

  const parts = [
    {
      color: bodyColor,
      pos: { x: baseX, y: baseY, z: 0.21 },
      size: { x: 0.64, y: 0.38, z: 0.22 },
      rot: { x: 0, y: 0, z: 0 },
    },
    {
      color: topColor,
      pos: { x: baseX, y: baseY, z: 0.39 },
      size: { x: 0.82, y: 0.5, z: 0.08 },
      rot: { x: 0, y: 0, z: 0 },
    },
  ];

  for (const leg of legs) {
    parts.push({
      color: shadeHexColor(bodyColor, 0.86),
      pos: { x: baseX + leg.x, y: baseY + leg.y, z: 0.02 },
      size: { x: 0.08, y: 0.08, z: 0.16 },
      shadeStrength: 0.18,
      rot: { x: 0, y: 0, z: 0 },
    });
  }

  if (object.type === ObjectType.SMELTER) {
    parts.push({
      color: highlighted ? "#ffd7ab" : "#d19f8c",
      pos: { x: baseX + 0.15, y: baseY - 0.09, z: 0.49 },
      size: { x: 0.12, y: 0.12, z: 0.18 },
      rot: { x: 0, y: 0, z: 0 },
    });
  }

  if (object.type === ObjectType.STOVE) {
    parts.push({
      color: highlighted ? "#cfd4d8" : "#b9c0c6",
      pos: { x: baseX + 0.12, y: baseY - 0.02, z: 0.47 },
      size: { x: 0.22, y: 0.2, z: 0.05 },
      rot: { x: 0, y: 0, z: 0 },
    });
    parts.push({
      color: highlighted ? "#e7ecf1" : "#d4dbe2",
      pos: { x: baseX + 0.18, y: baseY + 0.08, z: 0.5 },
      size: { x: 0.04, y: 0.04, z: 0.08 },
      rot: { x: 0, y: 0, z: 0 },
    });
  }

  if (object.type === ObjectType.STONE_CUTTER) {
    parts.push({
      color: "#cfdce6",
      pos: { x: baseX - 0.08, y: baseY, z: 0.495 },
      size: { x: 0.24, y: 0.12, z: 0.05 },
      rot: { x: 0, y: 0.18, z: 0 },
    });
  }

  if (object.type === ObjectType.CONSTRUCTION_BENCH) {
    parts.push({
      color: "#d8e8ef",
      pos: { x: baseX - 0.18, y: baseY, z: 0.43 },
      size: { x: 0.18, y: 0.14, z: 0.05 },
      rot: { x: 0, y: 0, z: 0 },
    });
    parts.push({
      color: "#d8e8ef",
      pos: { x: baseX + 0.14, y: baseY + 0.04, z: 0.43 },
      size: { x: 0.2, y: 0.12, z: 0.05 },
      rot: { x: 0, y: 0, z: 0 },
    });
  }

  return parts;
}

function npcVisuals(npc, highlighted) {
  const rat = npc.kind === "rat";
  const goblin = npc.kind === "goblin";
  const ally = npc.kind === "ally";
  const golem = npc.kind === "golem";

  if (!npc.alive) {
    return {
      body: rat ? "#6b6259" : goblin ? "#60755d" : ally ? "#5e6f6c" : "#5f4a45",
      head: rat ? "#7c7066" : goblin ? "#71926d" : ally ? "#6e8480" : "#7d6157",
      limb: rat ? "#5a5149" : goblin ? "#4f654d" : ally ? "#4f5f5c" : "#4f3d38",
      outline: rat ? "#2b2521" : goblin ? "#253624" : ally ? "#243431" : "#2d2020",
      eye: "#1a1110",
      highlighted,
      dead: true,
      rat,
      goblin,
      ally,
      golem,
    };
  }

  if (rat) {
    return {
      body: highlighted ? "#a89a88" : "#867a6b",
      head: highlighted ? "#c6b8a6" : "#a39481",
      limb: highlighted ? "#8f8374" : "#716659",
      outline: highlighted ? "#f1e6d5" : "#342d27",
      eye: highlighted ? "#ffe8ca" : "#efcda6",
      highlighted,
      dead: false,
      rat: true,
      goblin: false,
      ally: false,
      golem: false,
    };
  }

  if (goblin) {
    return {
      body: highlighted ? "#86bf82" : "#5f8f59",
      head: highlighted ? "#b6e4aa" : "#7eb471",
      limb: highlighted ? "#77ad72" : "#4f7a49",
      outline: highlighted ? "#e8ffd9" : "#2b4727",
      eye: highlighted ? "#fff6b9" : "#dce8a1",
      highlighted,
      dead: false,
      rat: false,
      goblin: true,
      ally: false,
      golem: false,
    };
  }

  if (ally) {
    return {
      body: highlighted ? "#8fd8bf" : "#67a892",
      head: highlighted ? "#b8f0de" : "#85c6af",
      limb: highlighted ? "#79c9b0" : "#568f7c",
      outline: highlighted ? "#defff2" : "#2f5a4f",
      eye: highlighted ? "#f3ffe7" : "#dbf0d5",
      highlighted,
      dead: false,
      rat: false,
      goblin: false,
      ally: true,
      golem: false,
    };
  }

  if (golem) {
    return {
      body: highlighted ? "#d18f79" : "#9f6658",
      head: highlighted ? "#f0b39e" : "#c18770",
      limb: highlighted ? "#bf7f69" : "#80564c",
      outline: highlighted ? "#ffe1c8" : "#4a2b25",
      eye: highlighted ? "#fff1a6" : "#ffd390",
      highlighted,
      dead: false,
      rat: false,
      goblin: false,
      ally: false,
      golem: true,
    };
  }

  return {
    body: highlighted ? "#8db2bf" : "#667f90",
    head: highlighted ? "#bbd4de" : "#8ca4b2",
    limb: highlighted ? "#7ba0ac" : "#536b7b",
    outline: highlighted ? "#e1f4ff" : "#2a3a47",
    eye: highlighted ? "#f4ffd7" : "#d8f1a6",
    highlighted,
    dead: false,
    rat: false,
    goblin: false,
    ally: false,
    golem: false,
  };
}

function drawNpcQuestMarker(ctx, sprite, topY) {
  const markerType = sprite.questMarker;
  if (!markerType) {
    return;
  }

  const symbol = markerType === "turnin" ? "!" : "?";
  const centerX = sprite.x + sprite.width * 0.5;
  const centerY = topY - Math.max(14, sprite.height * 0.16);
  const radius = Math.max(8, sprite.width * 0.18);

  ctx.save();
  ctx.fillStyle = "rgba(10, 12, 18, 0.86)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = markerType === "turnin" ? "#f6d66e" : "#b9d8ff";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#101621";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(10, Math.floor(radius * 1.5))}px monospace`;
  ctx.fillText(symbol, centerX, centerY + 0.5);
  ctx.restore();
}
function drawNpcSprite(ctx, sprite) {
  const { x, y, width, height, healthRatio, highlighted, npc } = sprite;
  const attackThrust = clamp(sprite.attackThrust ?? 0, 0, 1);
  const attackTelegraph = clamp(sprite.attackTelegraph ?? 0, 0, 1);
  const hurtStrength = clamp(sprite.hurtStrength ?? 0, 0, 1);
  const walkAmount = clamp(sprite.walkAmount ?? 0, 0, 1);
  const walkPhase = sprite.walkPhase ?? 0;
  const walkSwing = Math.sin(walkPhase) * walkAmount;
  const walkBounce = Math.abs(Math.sin(walkPhase * 0.5)) * walkAmount;
  const visual = npcVisuals(npc, highlighted);

  const shadowWidth = width * (0.32 + attackThrust * 0.08 + walkAmount * 0.02);
  ctx.fillStyle = "rgba(8, 9, 12, 0.28)";
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, y + height * 0.96, shadowWidth, height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  if (visual.dead) {
    ctx.fillStyle = visual.body;
    ctx.strokeStyle = visual.outline;
    ctx.lineWidth = Math.max(1, width * 0.03);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.12, y + height * 0.88);
    ctx.lineTo(x + width * 0.84, y + height * 0.8);
    ctx.lineTo(x + width * 0.9, y + height * 0.92);
    ctx.lineTo(x + width * 0.16, y + height * 0.98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }

  if (visual.rat) {
    const bodyY = y + height * (0.67 - walkBounce * 0.02);
    const bodyH = height * 0.2;
    const bodyW = width * 0.62;
    const bodyX = x + width * 0.21;

    ctx.fillStyle = visual.body;
    ctx.strokeStyle = visual.outline;
    ctx.lineWidth = Math.max(1, width * 0.03);
    ctx.beginPath();
    ctx.ellipse(bodyX + bodyW * 0.5, bodyY, bodyW * 0.5, bodyH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const headR = width * 0.14;
    const headX = x + width * (0.73 + attackThrust * 0.04);
    const headY = y + height * (0.62 - attackThrust * 0.03 - walkBounce * 0.02);
    ctx.fillStyle = visual.head;
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = visual.eye;
    ctx.fillRect(headX + headR * 0.15, headY - headR * 0.2, headR * 0.26, headR * 0.2);

    ctx.strokeStyle = visual.limb;
    ctx.lineWidth = Math.max(1, width * 0.028);
    const tailBaseX = bodyX - width * 0.02;
    const tailBaseY = bodyY + height * 0.01;
    const tailTipX = x + width * 0.04 - attackThrust * width * 0.05;
    const tailTipY = bodyY - height * 0.04 + walkSwing * height * 0.02;
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    ctx.quadraticCurveTo(x + width * 0.08, bodyY + height * 0.03, tailTipX, tailTipY);
    ctx.stroke();

    const ringY = y + height * 0.92;
    if (highlighted) {
      ctx.strokeStyle = sprite.meleeInRange ? "rgba(126, 225, 154, 0.92)" : "rgba(235, 185, 116, 0.92)";
      ctx.lineWidth = Math.max(1.4, width * 0.036);
      ctx.beginPath();
      ctx.ellipse(x + width * 0.5, ringY, width * 0.34, height * 0.045, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (attackTelegraph > 0.01) {
      ctx.strokeStyle = "rgba(255, 108, 96, " + (0.3 + attackTelegraph * 0.5) + ")";
      ctx.lineWidth = Math.max(1.4, width * 0.03);
      ctx.beginPath();
      ctx.ellipse(x + width * 0.5, ringY, width * (0.2 + attackTelegraph * 0.12), height * 0.032, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawNpcQuestMarker(ctx, sprite, y);

    if (highlighted || healthRatio < 1) {
      const barX = x + width * 0.2;
      const barY = y - Math.max(6, height * 0.12);
      const barW = width * 0.62;
      const barH = Math.max(3, height * 0.05);
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = healthRatio > 0.5 ? "#66d489" : healthRatio > 0.25 ? "#dbba67" : "#d97070";
      ctx.fillRect(barX + 1, barY + 1, (barW - 2) * clamp(healthRatio, 0, 1), barH - 2);
    }

    return;
  }

  const headR = width * 0.18;
  const headX = x + width * 0.5;
  const headY = y + height * (0.24 + attackThrust * 0.03 - walkBounce * 0.04);
  const torsoTop = y + height * (0.42 + attackThrust * 0.06 - walkBounce * 0.03);
  const torsoBottom = y + height * (0.83 - walkBounce * 0.015);
  const armY = y + height * (0.5 - attackThrust * 0.05 - walkBounce * 0.02);
  const armH = height * (0.3 + attackThrust * 0.08);
  const armShift = width * (attackThrust * 0.08 + walkSwing * 0.05);

  ctx.fillStyle = visual.body;
  ctx.strokeStyle = visual.outline;
  ctx.lineWidth = Math.max(1, width * 0.03);

  ctx.beginPath();
  ctx.moveTo(x + width * 0.28, torsoTop);
  ctx.lineTo(x + width * 0.72, torsoTop);
  ctx.lineTo(x + width * 0.78, torsoBottom);
  ctx.lineTo(x + width * 0.22, torsoBottom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = visual.limb;
  const leftArmY = armY + Math.max(0, walkSwing) * height * 0.02;
  const rightArmY = armY + Math.max(0, -walkSwing) * height * 0.02;
  ctx.fillRect(x + width * 0.18 - armShift, leftArmY, width * 0.13, armH);
  ctx.fillRect(x + width * 0.69 + armShift * 0.6, rightArmY, width * 0.13, armH);

  const legStride = width * walkSwing * 0.04;
  const legLift = height * 0.026;
  const leftLegLift = Math.max(0, walkSwing) * legLift;
  const rightLegLift = Math.max(0, -walkSwing) * legLift;
  ctx.fillRect(x + width * 0.31 + legStride, y + height * 0.81 + leftLegLift, width * 0.12, height * 0.16 - leftLegLift);
  ctx.fillRect(x + width * 0.57 - legStride, y + height * 0.81 + rightLegLift, width * 0.12, height * 0.16 - rightLegLift);

  ctx.fillStyle = visual.head;
  let eyeY = headY - headR * 0.1;
  let leftEyeX = headX - headR * 0.45;
  let rightEyeX = headX + headR * 0.19;
  let eyeW = headR * 0.26;
  let eyeH = headR * 0.22;

  if (visual.golem) {
    const halfW = headR * 0.92;
    const halfH = headR * 0.88;
    const bevel = headR * 0.2;
    ctx.beginPath();
    ctx.moveTo(headX - halfW + bevel, headY - halfH);
    ctx.lineTo(headX + halfW - bevel, headY - halfH);
    ctx.lineTo(headX + halfW, headY - halfH + bevel);
    ctx.lineTo(headX + halfW, headY + halfH - bevel);
    ctx.lineTo(headX + halfW - bevel, headY + halfH);
    ctx.lineTo(headX - halfW + bevel, headY + halfH);
    ctx.lineTo(headX - halfW, headY + halfH - bevel);
    ctx.lineTo(headX - halfW, headY - halfH + bevel);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    eyeY = headY - halfH * 0.14;
    leftEyeX = headX - halfW * 0.56;
    rightEyeX = headX + halfW * 0.16;
    eyeW = headR * 0.3;
    eyeH = headR * 0.2;
  } else {
    if (visual.goblin) {
      const earTopY = headY - headR * 1.18;
      const earBaseY = headY - headR * 0.35;
      const earOuterX = headX - headR * 0.9;
      const earInnerX = headX - headR * 0.46;
      ctx.beginPath();
      ctx.moveTo(earInnerX, earBaseY);
      ctx.lineTo(earOuterX, earTopY);
      ctx.lineTo(headX - headR * 0.32, headY - headR * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const rightEarOuterX = headX + headR * 0.9;
      const rightEarInnerX = headX + headR * 0.46;
      ctx.beginPath();
      ctx.moveTo(rightEarInnerX, earBaseY);
      ctx.lineTo(rightEarOuterX, earTopY);
      ctx.lineTo(headX + headR * 0.32, headY - headR * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = visual.eye;
  ctx.fillRect(leftEyeX, eyeY, eyeW, eyeH);
  ctx.fillRect(rightEyeX, eyeY, eyeW, eyeH);

  if (attackTelegraph > 0.01) {
    ctx.fillStyle = "rgba(255, 136, 118, " + (0.2 + attackTelegraph * 0.45) + ")";
    ctx.fillRect(headX - headR * 0.5, headY - headR * 1.35, headR, headR * 0.2);
  }

  if (hurtStrength > 0.01) {
    ctx.fillStyle = "rgba(255, 116, 102, " + (0.34 * hurtStrength) + ")";
    ctx.fillRect(x + width * 0.16, y + height * 0.34, width * 0.68, height * 0.56);
  }

  const ringY = y + height * 0.965;
  if (highlighted) {
    ctx.strokeStyle = sprite.meleeInRange ? "rgba(126, 225, 154, 0.92)" : "rgba(235, 185, 116, 0.92)";
    ctx.lineWidth = Math.max(1.4, width * 0.036);
    ctx.beginPath();
    ctx.ellipse(x + width * 0.5, ringY, width * 0.33, height * 0.05, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (attackTelegraph > 0.01) {
    ctx.strokeStyle = "rgba(255, 108, 96, " + (0.3 + attackTelegraph * 0.5) + ")";
    ctx.lineWidth = Math.max(1.4, width * 0.032);
    ctx.beginPath();
    ctx.ellipse(
      x + width * 0.5,
      ringY,
      width * (0.22 + attackTelegraph * 0.16),
      height * (0.03 + attackTelegraph * 0.024),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  drawNpcQuestMarker(ctx, sprite, y);

  if (highlighted || healthRatio < 1) {
    const barX = x + width * 0.16;
    const barY = y - Math.max(8, height * 0.12);
    const barW = width * 0.68;
    const barH = Math.max(4, height * 0.06);

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = healthRatio > 0.5 ? "#66d489" : healthRatio > 0.25 ? "#dbba67" : "#d97070";
    ctx.fillRect(barX + 1, barY + 1, (barW - 2) * clamp(healthRatio, 0, 1), barH - 2);
  }
}
export class Renderer {
  constructor(viewCanvas, minimapCanvas) {
    this.viewCanvas = viewCanvas;
    this.minimapCanvas = minimapCanvas;

    this.ctx = viewCanvas.getContext("2d");
    this.mapCtx = minimapCanvas.getContext("2d");

    this.width = 0;
    this.height = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(640, Math.floor(this.viewCanvas.clientWidth * ratio));
    const height = Math.max(360, Math.floor(this.viewCanvas.clientHeight * ratio));

    if (this.viewCanvas.width !== width || this.viewCanvas.height !== height) {
      this.viewCanvas.width = width;
      this.viewCanvas.height = height;
    }

    this.width = width;
    this.height = height;
  }

  render(state) {
    const depthBuffer = this.drawScene(state);
    this.drawWorldModels(state, depthBuffer);
    this.drawSprites(state, depthBuffer);
    this.drawDamagePopups(state, depthBuffer);
    this.drawViewModel(state);
    this.drawPlayerHitFlash(state);
    this.drawMinimap(state);
  }

  drawScene(state) {
    const { world, player } = state;

    const ceiling = this.ctx.createLinearGradient(0, 0, 0, this.height / 2);
    ceiling.addColorStop(0, "#202b38");
    ceiling.addColorStop(1, "#111823");

    const floor = this.ctx.createLinearGradient(0, this.height / 2, 0, this.height);
    floor.addColorStop(0, "#1a1d22");
    floor.addColorStop(1, "#0a0d12");

    this.ctx.fillStyle = ceiling;
    this.ctx.fillRect(0, 0, this.width, this.height / 2);
    this.ctx.fillStyle = floor;
    this.ctx.fillRect(0, this.height / 2, this.width, this.height / 2);

    const depthBuffer = new Float32Array(this.width);
    depthBuffer.fill(MAX_VIEW_DISTANCE);

    const projection = this.width / (2 * Math.tan(FOV / 2));
    const rayStep = 1;

    for (let x = 0; x < this.width; x += rayStep) {
      const cameraX = (x / this.width) * 2 - 1;
      const rayAngle = player.angle + Math.atan(cameraX * Math.tan(FOV / 2));

      const hit = castRay(world, player.x, player.y, rayAngle, MAX_VIEW_DISTANCE);
      const correctedDistance = hit.distance * Math.cos(rayAngle - player.angle);
      const wallHeight = Math.min(
        this.height,
        ((projection * (hit.heightScale ?? 1)) / Math.max(correctedDistance, 0.001)),
      );
      const centeredTop = (this.height - wallHeight) / 2;
      const floorLineY =
        this.height / 2 + (projection * (player.eyeHeight ?? 0.58)) / Math.max(correctedDistance, 0.001);
      const floorAnchoredObject =
        hit.object?.type === ObjectType.WALL_SEGMENT || hit.object?.type === ObjectType.DOOR;
      const top = floorAnchoredObject ? floorLineY - wallHeight : centeredTop;

      const distanceFade = Math.max(0.22, 1 - correctedDistance / MAX_VIEW_DISTANCE);
      const blockLocalX = hit.hitX - Math.floor(hit.hitX);
      const blockLocalY = hit.hitY - Math.floor(hit.hitY);
      const blockEdge = Math.max(
        Math.min(blockLocalX, 1 - blockLocalX),
        Math.min(blockLocalY, 1 - blockLocalY)
      );
      const seamDarken = blockEdge < 0.035 ? 0.04 : blockEdge < 0.08 ? 0.015 : 0;
      const bandCount = clamp(Math.floor(wallHeight / 96), 2, 3);
      const bandHeight = wallHeight / bandCount;

      for (let band = 0; band < bandCount; band += 1) {
        const v = (band + 0.5) / bandCount;
        const rowNoise = hashNoise2D(
          hit.tileX * 7 + band,
          hit.tileY * 7 + bandCount,
          6,
         );
        const bandShade = distanceFade * (1 + (band % 2 === 0 ? 0.018 : -0.018) + (rowNoise - 0.5) * 0.02);
        const y0 = Math.floor(top + band * bandHeight);
        const y1 = Math.ceil(top + (band + 1) * bandHeight);

        this.ctx.fillStyle = pickWallColor(world, hit, bandShade);
        this.ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
      }

      if (seamDarken > 0) {
        this.ctx.fillStyle = `rgba(10, 12, 16, ${seamDarken})`;
        this.ctx.fillRect(x, top, 1, wallHeight);
      }

      for (let j = x; j < x + rayStep && j < this.width; j += 1) {
        depthBuffer[j] = correctedDistance;
      }
    }

    return depthBuffer;
  }

  drawWorldModels(state, depthBuffer) {
    const { world, player, lookTarget } = state;
    const projection = this.width / (2 * Math.tan(FOV / 2));
    const modelFaces = [];

    world.forEachObjectNear(Math.floor(player.x), Math.floor(player.y), Math.ceil(MAX_VIEW_DISTANCE) + 1, (object) => {
      if (
        object.type !== ObjectType.STONE_CUTTER &&
        object.type !== ObjectType.SMELTER &&
        object.type !== ObjectType.CONSTRUCTION_BENCH &&
        object.type !== ObjectType.STOVE &&
        object.type !== ObjectType.SMALL_CHEST &&
        object.type !== ObjectType.DOOR
      ) {
        return;
      }

      const centerX = object.tileX + 0.5;
      const centerY = object.tileY + 0.5;
      const dx = centerX - player.x;
      const dy = centerY - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance > MAX_VIEW_DISTANCE || distance < 0.16) {
        return;
      }

      const angleToObject = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToObject - player.angle);
      if (Math.abs(relativeAngle) > FOV * 0.66) {
        return;
      }

      const highlighted = lookTarget?.kind === "object" && lookTarget.object?.id === object.id;
      const parts = benchModelParts(object, highlighted)
        .map((part) => {
          const cameraDepth = transformWorldPointToCamera(part.pos, player).z;
          return {
            ...part,
            distance,
            cameraDepth,
          };
        })
        .filter((part) => part.cameraDepth > -0.2);

      for (const part of parts) {
        modelFaces.push(...collectWorldCuboidFaces(part, player, projection, this.width, this.height, depthBuffer));
      }
    });

    modelFaces.sort((a, b) => b.depth - a.depth);
    for (const face of modelFaces) {
      drawWorldFace(this.ctx, face);
      for (let column = face.minX; column <= face.maxX; column += 1) {
        if (face.nearestDepth < depthBuffer[column]) {
          depthBuffer[column] = face.nearestDepth;
        }
      }
    }
  }

  drawSprites(state, depthBuffer) {
    const { world, player, lookTarget } = state;
    const projection = this.width / (2 * Math.tan(FOV / 2));
    const tanHalfFov = Math.tan(FOV / 2);
    const cameraHeight = 0.58;
    const cameraRightX = -Math.sin(player.angle);
    const cameraRightY = Math.cos(player.angle);

    const sprites = [];

    world.forEachObjectNear(Math.floor(player.x), Math.floor(player.y), Math.ceil(MAX_VIEW_DISTANCE) + 1, (object) => {
      if (
        object.type === ObjectType.WALL_SEGMENT ||
        object.type === ObjectType.STONE_CUTTER ||
        object.type === ObjectType.SMELTER ||
        object.type === ObjectType.CONSTRUCTION_BENCH ||
        object.type === ObjectType.STOVE ||
        object.type === ObjectType.SMALL_CHEST ||
        object.type === ObjectType.DOOR
      ) {
        return;
      }

      const centerX = object.tileX + 0.5;
      const centerY = object.tileY + 0.5;
      const dx = centerX - player.x;
      const dy = centerY - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 0.12 || distance > MAX_VIEW_DISTANCE) {
        return;
      }

      const angleToObject = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToObject - player.angle);
      if (Math.abs(relativeAngle) > FOV * 0.62) {
        return;
      }

      const style = spriteStyleForObject(object);
      const screenX = (0.5 + Math.tan(relativeAngle) / (2 * tanHalfFov)) * this.width;
      const spriteHeight = Math.max(8, (projection / distance) * style.scale * (style.hang ?? 1));
      const spriteWidth = spriteHeight * style.widthScale;

      const groundY = this.height / 2 + (projection * cameraHeight) / distance;
      const ceilingY = this.height / 2 - (projection * (1 - cameraHeight)) / distance;
      const left = screenX - spriteWidth / 2;
      let top = groundY - spriteHeight;
      if (style.anchor === "ceiling") {
        top = ceilingY;
      }

      const centerColumn = clamp(Math.floor(screenX), 0, this.width - 1);
      if (distance > depthBuffer[centerColumn]) {
        return;
      }

      sprites.push({
        kind: "object",
        object,
        distance,
        x: left,
        y: top,
        width: spriteWidth,
        height: spriteHeight,
        highlighted: lookTarget?.kind === "object" && lookTarget.object.id === object.id,
      });
    });

    for (const npc of state.npcs ?? []) {
      if (!npc.alive && (npc.deathTimer ?? 0) <= 0) {
        continue;
      }

      const dx = npc.x - player.x;
      const dy = npc.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.12 || distance > MAX_VIEW_DISTANCE) {
        continue;
      }

      const angleToNpc = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToNpc - player.angle);
      if (Math.abs(relativeAngle) > FOV * 0.62) {
        continue;
      }

      const hurtStrength = clamp((npc.hurtTimer ?? 0) / 0.22, 0, 1);
      const attackDuration = npc.attackAnimDuration ?? 0.44;
      const attackProgress = attackDuration > 0 ? 1 - clamp((npc.attackAnim ?? 0) / attackDuration, 0, 1) : 0;
      const attackThrust = npc.alive ? Math.max(0, Math.sin(attackProgress * Math.PI)) : 0;
      const strikeProgress = npc.attackHitProgress ?? 0.64;
      const attackTelegraph = npc.alive && (npc.attackAnim ?? 0) > 0 && !(npc.attackDidHit ?? false)
        ? clamp(attackProgress / Math.max(0.01, strikeProgress), 0, 1)
        : 0;
      const walkPhase = npc.walkCycle ?? 0;
      const walkAmount = clamp(npc.walkAmount ?? 0, 0, 1);
      const walkBob = Math.abs(Math.sin(walkPhase * 0.5)) * walkAmount;
      const currentQuestStep = npc.quest?.steps?.[npc.quest.currentStepIndex] ?? null;
      const questMarker = npc.kind === "goblin" && npc.alive && npc.category !== "allied"
        ? (!npc.quest
          ? "question"
          : ((!npc.quest.completed
            && (currentQuestStep?.readyToTurnIn
              || ((currentQuestStep?.progress ?? 0) >= (currentQuestStep?.required ?? Number.POSITIVE_INFINITY))))
            ? "turnin"
            : null))
        : null;

      const screenX = (0.5 + Math.tan(relativeAngle) / (2 * tanHalfFov)) * this.width;
      const rat = npc.kind === "rat";
      const goblin = npc.kind === "goblin";
      const ally = npc.kind === "ally";
      const baseScale = rat
        ? (npc.alive ? 0.5 + attackThrust * 0.08 : 0.32)
        : goblin
          ? (npc.alive ? 0.82 + attackThrust * 0.1 : 0.48)
          : ally
            ? (npc.alive ? 0.88 + attackThrust * 0.08 : 0.52)
            : (npc.alive ? 0.92 + attackThrust * 0.12 : 0.54);
      const spriteHeight = Math.max(10, (projection / distance) * baseScale);
      const spriteWidth = spriteHeight * (rat
        ? (npc.alive ? 0.88 : 0.92)
        : goblin
          ? (npc.alive ? 0.62 : 0.74)
          : ally
            ? (npc.alive ? 0.58 : 0.74)
            : (npc.alive ? 0.54 : 0.72));
      const groundY = this.height / 2 + (projection * cameraHeight) / distance;
      const hitLateral = (npc.hitReactX ?? 0) * cameraRightX + (npc.hitReactY ?? 0) * cameraRightY;
      const left = screenX - spriteWidth / 2 + hitLateral * hurtStrength * spriteWidth * 0.28;
      const top = groundY - spriteHeight - hurtStrength * spriteHeight * 0.08 + attackThrust * spriteHeight * 0.04 - walkBob * spriteHeight * 0.05;

      const centerColumn = clamp(Math.floor(screenX), 0, this.width - 1);
      if (distance > depthBuffer[centerColumn]) {
        continue;
      }

      sprites.push({
        kind: "npc",
        npc,
        distance,
        x: left,
        y: top,
        width: spriteWidth,
        height: spriteHeight,
        healthRatio: npc.maxHealth > 0 ? npc.health / npc.maxHealth : 0,
        highlighted: lookTarget?.kind === "npc" && lookTarget.npc?.id === npc.id,
        meleeInRange: lookTarget?.kind === "npc" && lookTarget.npc?.id === npc.id ? !!lookTarget.inKnifeRange : false,
        hurtStrength,
        attackThrust,
        attackTelegraph,
        walkPhase,
        walkAmount,
        questMarker,
      });
    }

    sprites.sort((a, b) => b.distance - a.distance);

    for (const sprite of sprites) {
      if (sprite.x > this.width || sprite.x + sprite.width < 0) {
        continue;
      }

      if (sprite.kind === "npc") {
        drawNpcSprite(this.ctx, sprite);
      } else {
        drawObjectSprite(this.ctx, sprite.object, sprite);
      }
    }
  }


  drawDamagePopups(state, depthBuffer) {
    const popups = state.combat?.damagePopups ?? [];
    if (!popups.length) {
      return;
    }

    const { player } = state;
    const projection = this.width / (2 * Math.tan(FOV / 2));
    const tanHalfFov = Math.tan(FOV / 2);
    const cameraHeight = 0.58;

    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    for (const popup of popups) {
      const dx = popup.x - player.x;
      const dy = popup.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.1 || distance > MAX_VIEW_DISTANCE) {
        continue;
      }

      const angleToPopup = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToPopup - player.angle);
      if (Math.abs(relativeAngle) > FOV * 0.66) {
        continue;
      }

      const screenX = (0.5 + Math.tan(relativeAngle) / (2 * tanHalfFov)) * this.width;
      const centerColumn = clamp(Math.floor(screenX), 0, this.width - 1);
      if (distance > depthBuffer[centerColumn] + 0.2) {
        continue;
      }

      const life = popup.duration > 0 ? clamp(popup.timer / popup.duration, 0, 1) : 0;
      const rise = 1 - life;
      const baseY = this.height / 2 + (projection * cameraHeight) / distance;
      const popupHeight = popup.zOffset ?? 0.92;
      const screenY = baseY - (projection * popupHeight) / distance - rise * 34;

      const size = clamp(12 + (projection / Math.max(distance, 0.2)) * 0.035, 12, 26);
      const alpha = clamp(life * 1.24, 0, 1);
      this.ctx.font = `${Math.floor(size)}px "Trebuchet MS", Tahoma, Verdana, sans-serif`;

      this.ctx.fillStyle = `rgba(0, 0, 0, ${0.62 * alpha})`;
      this.ctx.fillText(`-${popup.value}`, screenX + 1.5, screenY + 1.5);

      this.ctx.fillStyle = popup.color ?? "#ffe08c";
      this.ctx.globalAlpha = alpha;
      this.ctx.fillText(`-${popup.value}`, screenX, screenY);
      this.ctx.globalAlpha = 1;
    }

    this.ctx.restore();
  }

  drawPlayerHitFlash(state) {
    const flashTimer = state.player?.hurtFlash ?? state.player?.hurtTimer ?? 0;
    if (flashTimer <= 0) {
      return;
    }

    const intensity = clamp(flashTimer / 0.22, 0, 1);
    this.ctx.fillStyle = `rgba(170, 24, 24, ${0.1 * intensity})`;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const radial = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.12,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.8,
    );
    radial.addColorStop(0, `rgba(255, 112, 96, ${0.02 * intensity})`);
    radial.addColorStop(0.68, `rgba(208, 44, 44, ${0.14 * intensity})`);
    radial.addColorStop(1, `rgba(150, 12, 12, ${0.34 * intensity})`);
    this.ctx.fillStyle = radial;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  drawViewModel(state) {
    if (state.ui?.playerWindowOpen || state.ui?.hammerWindowOpen || state.ui?.objectWindowOpen) {
      return;
    }

    const { selectedTool, viewModel } = state;
    const swing = clamp(viewModel.swing, 0, 1);
    const swingEase = 1 - (1 - swing) * (1 - swing);
    const bobY = Math.sin(viewModel.bob) * 0.028;
    const bobX = Math.sin(viewModel.bob * 0.5) * 0.02;

    const camera = {
      centerX: 0.52,
      centerY: 0.82,
      scale: this.height * 1.02,
      zOffset: 0.24,
    };

    const parts = [];
    const attach = (origin, rot, offset) => {
      const shifted = rotatePoint(offset, rot.x, rot.y, rot.z);
      return {
        x: origin.x + shifted.x,
        y: origin.y + shifted.y,
        z: origin.z + shifted.z,
      };
    };

    const leftShoulder = { x: -0.34 + bobX * 0.45, y: -0.1 + bobY * 0.4, z: 0.9 };
    const leftArmRot = { x: -0.44, y: 0.0, z: -0.52 };
    const leftArmLength = 0.36;
    const leftHandLength = 0.15;
    const leftArmCenter = attach(leftShoulder, leftArmRot, { x: 0, y: 0, z: leftArmLength * 0.5 });
    const leftWrist = attach(leftShoulder, leftArmRot, { x: 0, y: 0, z: leftArmLength });
    const leftHandCenter = attach(leftWrist, leftArmRot, { x: 0, y: 0, z: leftHandLength * 0.5 });
    parts.push({
      color: "#7b5d49",
      pos: leftArmCenter,
      size: { x: 0.14, y: 0.1, z: leftArmLength },
      rot: leftArmRot,
    });
    parts.push({
      color: "#a9876d",
      pos: leftHandCenter,
      size: { x: 0.12, y: 0.09, z: leftHandLength },
      rot: leftArmRot,
    });

    const rightShoulder = {
      x: 0.28 + bobX + swingEase * 0.03,
      y: -0.08 + bobY - swingEase * 0.04,
      z: 0.88 - swingEase * 0.04,
    };
    const rightArmRot = {
      x: -0.42 + swingEase * 0.92,
      y: 0.06 - swingEase * 0.16,
      z: 0.54 - swingEase * 0.14,
    };
    const rightArmLength = 0.42;
    const rightHandLength = 0.16;
    const rightArmCenter = attach(rightShoulder, rightArmRot, { x: 0, y: 0, z: rightArmLength * 0.5 });
    const rightWrist = attach(rightShoulder, rightArmRot, { x: 0, y: 0, z: rightArmLength });
    const rightHandCenter = attach(rightWrist, rightArmRot, { x: 0, y: 0, z: rightHandLength * 0.5 });
    const rightGrip = attach(rightWrist, rightArmRot, { x: 0.014, y: -0.008, z: 0.06 });
    parts.push({
      color: "#7b5d49",
      pos: rightArmCenter,
      size: { x: 0.14, y: 0.1, z: rightArmLength },
      rot: rightArmRot,
    });
    parts.push({
      color: "#a9876d",
      pos: rightHandCenter,
      size: { x: 0.12, y: 0.09, z: rightHandLength },
      rot: rightArmRot,
    });

    if (selectedTool === ToolId.KNIFE) {
      const handleLength = 0.19;
      const toolRot = {
        x: rightArmRot.x - 0.38 + swingEase * 0.26,
        y: rightArmRot.y + 0.52 + swingEase * 0.08,
        z: rightArmRot.z + 0.52 - swingEase * 0.1,
      };
      const handleCenter = attach(rightGrip, toolRot, { x: 0, y: 0, z: handleLength * 0.5 });
      const guardCenter = attach(rightGrip, toolRot, { x: 0, y: 0.012, z: handleLength + 0.02 });
      const bladeCenter = attach(rightGrip, toolRot, { x: 0, y: 0.02, z: handleLength + 0.16 });
      const bladeTip = attach(rightGrip, toolRot, { x: 0, y: 0.024, z: handleLength + 0.245 });
      parts.push({
        color: "#6e543f",
        pos: handleCenter,
        size: { x: 0.045, y: 0.05, z: handleLength },
        rot: toolRot,
      });
      parts.push({
        color: "#a8b5c3",
        pos: guardCenter,
        size: { x: 0.11, y: 0.03, z: 0.035 },
        rot: toolRot,
      });
      parts.push({
        color: "#d9e4ef",
        pos: bladeCenter,
        size: { x: 0.045, y: 0.024, z: 0.22 },
        rot: toolRot,
      });
      parts.push({
        color: "#f1f7ff",
        pos: bladeTip,
        size: { x: 0.018, y: 0.016, z: 0.08 },
        rot: toolRot,
      });
    } else if (selectedTool === ToolId.PICKAXE) {
      const handleLength = 0.56;
      const toolRot = {
        x: rightArmRot.x + 0.1,
        y: rightArmRot.y + 0.2,
        z: rightArmRot.z + 0.24,
      };
      const handleCenter = attach(rightGrip, toolRot, { x: 0, y: 0, z: handleLength * 0.5 });
      const headCenter = attach(rightGrip, toolRot, { x: 0, y: 0.014, z: handleLength + 0.03 });
      const pickBeakCenter = attach(rightGrip, toolRot, { x: 0.14, y: 0, z: handleLength + 0.015 });
      parts.push({
        color: "#6e543f",
        pos: handleCenter,
        size: { x: 0.045, y: 0.045, z: handleLength },
        rot: toolRot,
      });
      parts.push({
        color: "#bcc6d2",
        pos: headCenter,
        size: { x: 0.31, y: 0.06, z: 0.08 },
        rot: toolRot,
      });
      parts.push({
        color: "#d7e0ea",
        pos: pickBeakCenter,
        size: { x: 0.085, y: 0.04, z: 0.07 },
        rot: toolRot,
      });
    } else if (selectedTool === ToolId.HATCHET) {
      const handleLength = 0.46;
      const toolRot = {
        x: rightArmRot.x + 0.08,
        y: rightArmRot.y + 0.28,
        z: rightArmRot.z + 0.2,
      };
      const handleCenter = attach(rightGrip, toolRot, { x: 0, y: 0, z: handleLength * 0.5 });
      const headCenter = attach(rightGrip, toolRot, { x: 0.07, y: 0.012, z: handleLength + 0.02 });
      const bladeCenter = attach(rightGrip, toolRot, { x: 0.13, y: 0.012, z: handleLength + 0.02 });
      const pollCenter = attach(rightGrip, toolRot, { x: -0.09, y: 0.01, z: handleLength + 0.02 });
      parts.push({
        color: "#6e543f",
        pos: handleCenter,
        size: { x: 0.048, y: 0.048, z: handleLength },
        rot: toolRot,
      });
      parts.push({
        color: "#bcc6d2",
        pos: headCenter,
        size: { x: 0.14, y: 0.07, z: 0.08 },
        rot: toolRot,
      });
      parts.push({
        color: "#dce5ee",
        pos: bladeCenter,
        size: { x: 0.11, y: 0.035, z: 0.08 },
        rot: toolRot,
      });
      parts.push({
        color: "#aeb8c4",
        pos: pollCenter,
        size: { x: 0.06, y: 0.05, z: 0.07 },
        rot: toolRot,
      });
    } else {
      const handleLength = 0.5;
      const toolRot = {
        x: rightArmRot.x + 0.1,
        y: rightArmRot.y + 0.2,
        z: rightArmRot.z + 0.24,
      };
      const handleCenter = attach(rightGrip, toolRot, { x: 0, y: 0, z: handleLength * 0.5 });
      const hammerHeadCenter = attach(rightGrip, toolRot, { x: 0, y: 0.01, z: handleLength + 0.025 });
      const hammerPeenCenter = attach(rightGrip, toolRot, { x: 0.1, y: 0, z: handleLength + 0.025 });
      parts.push({
        color: "#6e543f",
        pos: handleCenter,
        size: { x: 0.05, y: 0.05, z: handleLength },
        rot: toolRot,
      });
      parts.push({
        color: "#b6c0ca",
        pos: hammerHeadCenter,
        size: { x: 0.25, y: 0.12, z: 0.11 },
        rot: toolRot,
      });
      parts.push({
        color: "#dbe4ef",
        pos: hammerPeenCenter,
        size: { x: 0.08, y: 0.06, z: 0.1 },
        rot: {
          x: toolRot.x,
          y: toolRot.y - 0.25,
          z: toolRot.z,
        },
      });
    }

    parts.sort((a, b) => b.pos.z - a.pos.z);

    for (const part of parts) {
      drawCuboid(this.ctx, part, camera, this.width, this.height);
    }
  }

  drawMinimap(state) {
    const { world, player } = state;
    const ctx = this.mapCtx;
    const cellSize = 4;
    const span = 24;

    ctx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    ctx.fillStyle = "#040608";
    ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

    const baseTileX = Math.floor(player.x);
    const baseTileY = Math.floor(player.y);

    for (let my = -span; my < span; my += 1) {
      for (let mx = -span; mx < span; mx += 1) {
        const tileX = baseTileX + mx;
        const tileY = baseTileY + my;

        const tile = world.getTile(tileX, tileY);
        const chunkType = world.chunkTypeAtTile(tileX, tileY);

        let color = "#000000";

        if (tile === TileType.WALL) {
          color = chunkType === ChunkType.DUNGEON ? "#2d1d1a" : "#11161d";
        } else if (tile === TileType.FLOOR) {
          color = chunkType === ChunkType.DUNGEON ? "#5b3830" : "#2a3340";
        }

        ctx.fillStyle = color;
        ctx.fillRect((mx + span) * cellSize, (my + span) * cellSize, cellSize, cellSize);
      }
    }

    world.forEachObjectNear(baseTileX, baseTileY, span, (object) => {
      const mapX = (object.tileX - baseTileX + span) * cellSize;
      const mapY = (object.tileY - baseTileY + span) * cellSize;

      if (object.type === ObjectType.ORE_NODE) {
        const oreVisual = oreVisualsForResource(object.data?.resourceId);
        ctx.fillStyle = oreVisual.minimap;
        ctx.fillRect(mapX + 1, mapY + 1, 2, 2);
        return;
      }

      if (object.type === ObjectType.WOODY_ROOT) {
        ctx.fillStyle = "#a37c58";
        ctx.fillRect(mapX + 1, mapY, 2, 3);
        return;
      }

      if (object.type === ObjectType.MUSHROOM) {
        ctx.fillStyle = "#d1a37e";
        ctx.fillRect(mapX + 1, mapY + 1, 2, 2);
        return;
      }


      if (object.type === ObjectType.PICKUP) {
        const pickupVisual = pickupVisualsForResource(object.data?.resourceId);
        ctx.fillStyle = pickupVisual.minimap;
        ctx.fillRect(mapX + 1, mapY + 1, 2, 2);
        return;
      }

      if (object.type === ObjectType.STONE_CUTTER) {
        ctx.fillStyle = "#8ab7c6";
        ctx.fillRect(mapX, mapY, 4, 4);
        return;
      }

      if (object.type === ObjectType.SMELTER) {
        ctx.fillStyle = "#d48776";
        ctx.fillRect(mapX, mapY, 4, 4);
        return;
      }

      if (object.type === ObjectType.STOVE) {
        ctx.fillStyle = "#9ca9b4";
        ctx.fillRect(mapX, mapY, 4, 4);
        return;
      }

      if (object.type === ObjectType.CONSTRUCTION_BENCH) {
        ctx.fillStyle = "#77b6cb";
        ctx.fillRect(mapX, mapY, 4, 4);
        return;
      }

      if (object.type === ObjectType.SMALL_CHEST) {
        ctx.fillStyle = "#b79466";
        ctx.fillRect(mapX, mapY, 4, 4);
        return;
      }

      if (object.type === ObjectType.DOOR) {
        const axis = object.data?.axis ?? "x";
        const open = !!object.data?.open;
        ctx.fillStyle = open ? "#6fa8bf" : "#93b8c8";
        if (!open) {
          if (axis === "x") {
            ctx.fillRect(mapX, mapY + 1, 4, 2);
          } else {
            ctx.fillRect(mapX + 1, mapY, 2, 4);
          }
        } else if (axis === "x") {
          ctx.fillRect(mapX + 3, mapY, 1, 4);
        } else {
          ctx.fillRect(mapX, mapY + 3, 4, 1);
        }
        return;
      }

      if (object.type === ObjectType.WALL_SEGMENT) {
        const c = object.data.connections ?? 0;
        ctx.fillStyle = "#d6e2ee";
        ctx.fillRect(mapX + 1, mapY + 1, 2, 2);
        if (c & 1) {
          ctx.fillRect(mapX + 1, mapY, 2, 1);
        }
        if (c & 2) {
          ctx.fillRect(mapX + 3, mapY + 1, 1, 2);
        }
        if (c & 4) {
          ctx.fillRect(mapX + 1, mapY + 3, 2, 1);
        }
        if (c & 8) {
          ctx.fillRect(mapX, mapY + 1, 1, 2);
        }
      }
    });

    for (const npc of state.npcs ?? []) {
      if (!npc.alive && (npc.deathTimer ?? 0) <= 0) {
        continue;
      }

      const mapX = (npc.x - baseTileX + span) * cellSize;
      const mapY = (npc.y - baseTileY + span) * cellSize;

      if (mapX < 0 || mapY < 0 || mapX >= this.minimapCanvas.width || mapY >= this.minimapCanvas.height) {
        continue;
      }

      ctx.fillStyle = npc.alive
        ? npc.category === "allied"
          ? "#7fe7a6"
          : npc.kind === "golem"
            ? "#ff8c6a"
            : npc.kind === "goblin"
              ? (npc.provoked ? "#c18b58" : "#85c37c")
              : npc.kind === "rat"
                ? (npc.provoked ? "#c78368" : "#98a2ac")
                : "#a9d3e8"
        : "#6f4a42";
      ctx.fillRect(Math.floor(mapX), Math.floor(mapY), 2, 2);
    }

    const px = span * cellSize;
    const py = span * cellSize;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(player.angle) * 14, py + Math.sin(player.angle) * 14);
    ctx.stroke();
  }
}
