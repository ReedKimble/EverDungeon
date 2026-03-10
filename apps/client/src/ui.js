import {
  BUILD_DEFINITIONS,
  ChunkType,
  HOTBAR_BINDINGS,
  ObjectType,
  RESOURCE_DEFINITIONS,
  ResourceId,
  TOOLBAR_BINDINGS,
  TOOL_DEFINITIONS,
  ToolId,
} from "./config.js";

const PLACEABLE_RESOURCE_IDS = new Set([ResourceId.STONE_BLOCK, ResourceId.WALL_KIT, ResourceId.DOOR_KIT, ResourceId.SMALL_CHEST]);
const EVERDUNGEON_DND_MIME = "application/x-everdungeon";
const EVERDUNGEON_DND_TEXT_PREFIX = "__everdungeon__:";

function slotTemplate(keyLabel, slot) {
  const icon = slot?.icon ?? "--";
  const name = slot?.name ?? "";
  return `<span class="slot-key">${keyLabel}</span><span class="slot-icon">${icon}</span><span class="slot-name">${name}</span>`;
}

function payloadFromEvent(event, fallbackPayload = null) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return fallbackPayload;
  }

  const parsePayload = (raw) => {
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const customPayload = parsePayload(dataTransfer.getData(EVERDUNGEON_DND_MIME));
  if (customPayload) {
    return customPayload;
  }

  const textPayload = dataTransfer.getData("text/plain");
  if (textPayload?.startsWith(EVERDUNGEON_DND_TEXT_PREFIX)) {
    return parsePayload(textPayload.slice(EVERDUNGEON_DND_TEXT_PREFIX.length));
  }

  const transferTypes = Array.from(dataTransfer.types ?? []);
  if (transferTypes.length === 0) {
    return fallbackPayload;
  }

  return null;
}

function setDragPayload(event, payload) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return;
  }

  const serialized = JSON.stringify(payload);
  dataTransfer.setData(EVERDUNGEON_DND_MIME, serialized);
  dataTransfer.setData("text/plain", `${EVERDUNGEON_DND_TEXT_PREFIX}${serialized}`);
  dataTransfer.effectAllowed = "move";
}

function resolveActionItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.kind === "tool") {
    const toolDef = TOOL_DEFINITIONS[item.id];
    if (!toolDef) {
      return null;
    }

    return {
      kind: "tool",
      id: item.id,
      icon: toolDef.icon,
      name: toolDef.label,
      className: toolDef.className,
      actionType: "tool",
    };
  }

  if (item.kind === "resource") {
    const resourceDef = RESOURCE_DEFINITIONS[item.id];
    if (!resourceDef) {
      return null;
    }

    let actionType = "resource";
    if (item.id === ResourceId.SIMPLE_STEW) {
      actionType = "consumable";
    } else if (PLACEABLE_RESOURCE_IDS.has(item.id)) {
      actionType = "placeable";
    }

    return {
      kind: "resource",
      id: item.id,
      icon: resourceDef.icon,
      name: resourceDef.label,
      className: resourceDef.className,
      actionType,
    };
  }

  return null;
}

export class Hud {
  constructor(toolbarBindings = TOOLBAR_BINDINGS, hotbarBindings = HOTBAR_BINDINGS, handlers = {}) {
    this.handlers = handlers;
    this.toolbarBindings = toolbarBindings;
    this.hotbarBindings = hotbarBindings;
    this.activeHotbarIndex = 0;
    this.hotbarCount = 1;

    this.status = document.getElementById("status");
    this.messages = document.getElementById("messages");
    this.help = document.getElementById("help");
    this.helpClose = document.getElementById("help-close");
    this.healthBarFill = document.getElementById("bar-health-fill");
    this.healthBarValue = document.getElementById("bar-health-value");
    this.staminaBarFill = document.getElementById("bar-stamina-fill");
    this.staminaBarValue = document.getElementById("bar-stamina-value");
    this.manaBarFill = document.getElementById("bar-mana-fill");
    this.manaBarValue = document.getElementById("bar-mana-value");
    this.effectsWindow = document.getElementById("effects-window");
    this.effectsList = document.getElementById("effects-list");

    this.toolbar = document.getElementById("toolbar");
    this.hotbar = document.getElementById("hotbar");

    this.playerWindow = document.getElementById("player-window");
    this.playerWindowClose = document.getElementById("player-window-close");
    this.playerInventory = document.getElementById("player-inventory");
    this.playerSlots = document.getElementById("player-craft-slots");
    this.playerRecipes = document.getElementById("player-recipes");
    this.playerCraftButton = document.getElementById("player-craft-button");
    this.playerClearButton = document.getElementById("player-clear-button");

    this.objectWindow = document.getElementById("object-window");
    this.objectWindowClose = document.getElementById("object-window-close");
    this.objectTitle = document.getElementById("object-window-title");
    this.objectSubtitle = document.getElementById("object-window-subtitle");
    this.objectSettings = document.getElementById("object-settings");
    this.objectInventory = document.getElementById("object-inventory");
    this.objectSlots = document.getElementById("object-craft-slots");
    this.objectRecipes = document.getElementById("object-recipes");
    this.objectCraftButton = document.getElementById("object-craft-button");
    this.objectClearButton = document.getElementById("object-clear-button");

    this.hammerWindow = document.getElementById("hammer-window");
    this.hammerWindowClose = document.getElementById("hammer-window-close");
    this.hammerBuildList = document.getElementById("hammer-build-list");
    this.questWindow = document.getElementById("quest-window");
    this.questWindowClose = document.getElementById("quest-window-close");
    this.questTabActive = document.getElementById("quest-tab-active");
    this.questTabCompleted = document.getElementById("quest-tab-completed");
    this.questJournalList = document.getElementById("quest-journal-list");

    this.messageLog = [];
    this.windowSignature = "";
    this.effectsSignature = "";
    this.activeDragPayload = null;
    this.draggedWindow = null;
    this.windowDragZ = 25;

    this.toolbarNodes = this.createActionStrip(this.toolbar, this.toolbarBindings, "toolbar");
    this.hotbarNodes = this.createActionStrip(this.hotbar, this.hotbarBindings, "hotbar");

    this.helpClose?.addEventListener("click", () => {
      this.help.classList.add("hidden");
    });

    this.playerWindowClose.addEventListener("click", () => {
      this.emit({ type: "close-player-window" });
    });
    this.objectWindowClose.addEventListener("click", () => {
      this.emit({ type: "close-object-window" });
    });
    this.hammerWindowClose.addEventListener("click", () => {
      this.emit({ type: "close-hammer-window" });
    });
    this.questWindowClose.addEventListener("click", () => {
      this.emit({ type: "close-quest-window" });
    });
    this.questTabActive.addEventListener("click", () => {
      this.emit({ type: "set-quest-journal-tab", tab: "active" });
    });
    this.questTabCompleted.addEventListener("click", () => {
      this.emit({ type: "set-quest-journal-tab", tab: "completed" });
    });

    this.playerCraftButton.addEventListener("click", () => {
      this.emit({ type: "craft", contextId: "player" });
    });
    this.playerClearButton.addEventListener("click", () => {
      this.emit({ type: "clear-slots", contextId: "player" });
    });

    this.objectCraftButton.addEventListener("click", () => {
      this.emit({ type: "craft", contextId: "object" });
    });
    this.objectClearButton.addEventListener("click", () => {
      this.emit({ type: "clear-slots", contextId: "object" });
    });

    this.wireInventoryDrop(this.playerInventory);
    this.wireInventoryDrop(this.objectInventory);
    this.installDragDropGuards();
    this.installWindowDragging();
  }

  emit(action) {
    this.handlers.onUiAction?.(action);
  }

  createActionStrip(container, bindings, target) {
    container.innerHTML = "";
    const nodes = [];

    for (let i = 0; i < bindings.length; i += 1) {
      const binding = bindings[i];
      const node = document.createElement("div");
      node.className = "slot empty";
      node.innerHTML = slotTemplate(binding.keyLabel, null);

      node.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });

      node.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = payloadFromEvent(event, this.activeDragPayload);
        this.activeDragPayload = null;
        if (!payload) {
          return;
        }

        if (payload.type === "inventory-item") {
          this.emit({
            type: "assign-action-slot",
            target,
            slotIndex: i,
            hotbarIndex: this.activeHotbarIndex,
            item: payload.item,
          });
          return;
        }

        if (payload.type === "action-slot-item") {
          this.emit({
            type: "move-action-slot",
            fromTarget: payload.target,
            fromSlotIndex: payload.slotIndex,
            fromHotbarIndex: payload.hotbarIndex,
            toTarget: target,
            toSlotIndex: i,
            toHotbarIndex: this.activeHotbarIndex,
          });
        }
      });

      node.addEventListener("click", () => {
        if (target === "toolbar") {
          this.emit({ type: "select-toolbar-slot", slotIndex: i });
        } else {
          this.emit({ type: "activate-hotbar-slot", slotIndex: i });
        }
      });

      nodes.push(node);
      container.append(node);
    }

    return nodes;
  }

  wireInventoryDrop(container) {
    container.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });

    container.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = payloadFromEvent(event, this.activeDragPayload);
      this.activeDragPayload = null;
      if (!payload) {
        return;
      }

      if (payload.type === "slot-resource") {
        this.emit({
          type: "return-slot",
          contextId: payload.contextId,
          slotIndex: payload.slotIndex,
        });
        return;
      }

      if (payload.type === "action-slot-item") {
        this.emit({
          type: "clear-action-slot",
          target: payload.target,
          slotIndex: payload.slotIndex,
          hotbarIndex: payload.hotbarIndex,
        });
      }
    });
  }

  updateActionSlotNode(node, binding, slotView, target, slotIndex) {
    node.className = "slot";
    node.innerHTML = slotTemplate(binding.keyLabel, slotView);

    if (!slotView) {
      node.classList.add("empty");
      node.draggable = false;
      node.ondragstart = null;
      node.ondragend = null;
      return;
    }

    if (slotView.className) {
      node.classList.add(slotView.className);
    }
    node.classList.add("filled", `action-${slotView.actionType ?? "resource"}`);
    node.draggable = true;
    node.ondragstart = (event) => {
      const payload = {
        type: "action-slot-item",
        target,
        slotIndex,
        hotbarIndex: this.activeHotbarIndex,
      };
      this.activeDragPayload = payload;
      setDragPayload(event, payload);
    };
    node.ondragend = () => {
      this.activeDragPayload = null;
    };
  }

  renderActionSlots(toolbarSlots, hotbarSlots, activeHotbarIndex = 0, hotbarCount = 1) {
    this.activeHotbarIndex = activeHotbarIndex;
    this.hotbarCount = hotbarCount;

    for (let i = 0; i < this.toolbarNodes.length; i += 1) {
      this.updateActionSlotNode(this.toolbarNodes[i], this.toolbarBindings[i], toolbarSlots?.[i] ?? null, "toolbar", i);
    }

    for (let i = 0; i < this.hotbarNodes.length; i += 1) {
      this.updateActionSlotNode(this.hotbarNodes[i], this.hotbarBindings[i], hotbarSlots?.[i] ?? null, "hotbar", i);
      this.hotbarNodes[i].classList.toggle("active-hotbar-key", hotbarCount > 1);
    }
  }

  setToolbarActive(index) {
    this.toolbarNodes.forEach((slot, i) => {
      slot.classList.toggle("active", i === index);
    });
  }

  setStatus(state) {
    this.setPlayerBars(state.player);
    this.setPlayerEffects(state.player);
    const areaName = state.currentChunkType === ChunkType.DUNGEON ? "Dungeon" : "Cavern";
    const areaRule = state.currentChunkType === ChunkType.DUNGEON ? "No Build" : "Editable";
    const areaColor =
      state.currentChunkType === ChunkType.DUNGEON ? "var(--accent-dungeon)" : "var(--accent-cavern)";

    const toolNameById = {
      [ToolId.KNIFE]: "Knife",
      [ToolId.PICKAXE]: "Pickaxe",
      [ToolId.HATCHET]: "Hatchet",
      [ToolId.HAMMER]: "Hammer",
    };
    const selectedAction = resolveActionItem(state.toolbarSlots?.[state.selectedSlot] ?? null);
    const selectedActionLabel = selectedAction ? selectedAction.name : "Empty";
    const equippedToolName = toolNameById[state.selectedTool] ?? "Unknown";
    const buildName = BUILD_DEFINITIONS[state.selectedBuild]?.name ?? "-";
    const hostileCount = state.combat?.hostiles ?? 0;
    const npcSummary = state.combat?.npcSummary ?? { hostile: hostileCount, agnostic: 0, allied: 0 };

    let targetText = "Target: None";
    if (state.lookTarget?.kind === "npc") {
      const npc = state.lookTarget.npc;
      const npcName =
        npc?.kind === "goblin"
          ? npc?.category === "allied"
            ? "Goblin Ally"
            : "Goblin"
          : npc?.kind === "ally"
            ? "Ally"
            : npc?.kind === "rat"
              ? "Rat"
              : "Golem";
      const dispositionText =
        npc?.category === "allied"
          ? " | Allied"
          : npc?.category === "agnostic"
            ? npc?.provoked
              ? " | Hostile"
              : " | Agnostic"
            : " | Hostile";
      const distanceText = Number.isFinite(state.lookTarget.distance) ? state.lookTarget.distance.toFixed(2) : "-";
      const knifeText = state.lookTarget.inKnifeRange ? "Knife: In Range" : "Knife: Step Closer";
      const windupText = state.lookTarget.enemyWindingUp ? " | Enemy: Windup" : "";
      const levelText = Number.isFinite(npc?.level) ? ` Lv ${npc.level}` : "";
      let questText = "";
      if (npc?.kind === "goblin" && npc?.category !== "allied") {
        const quest = npc?.quest;
        if (!quest) {
          questText = " | Quest: Talk (F)";
        } else if (quest.completed) {
          questText = " | Quest: Complete (F Recruit)";
        } else {
          const step = quest.steps?.[quest.currentStepIndex ?? 0];
          if (step) {
            questText = ` | Quest: ${step.progress}/${step.required}`;
          }
        }
      }
      targetText = `Target: ${npcName}${levelText}${dispositionText} (${Math.max(0, Math.ceil(npc.health))}/${npc.maxHealth} HP) | Dist ${distanceText}m | ${knifeText}${windupText}${questText}`;
    } else if (state.lookTarget?.kind === "block") {
      targetText = `Target: Raw Stone Block (${state.lookTarget.tileX}, ${state.lookTarget.tileY})`;
    } else if (state.lookTarget?.kind === "object") {
      const object = state.lookTarget.object;
      if (object.type === ObjectType.ORE_NODE) {
        const oreResourceId = object.data.resourceId ?? ResourceId.COPPER_ORE;
        const oreLabel = RESOURCE_DEFINITIONS[oreResourceId]?.label ?? "Ore";
        targetText = `Target: ${oreLabel} Node (${state.lookTarget.tileX}, ${state.lookTarget.tileY})`;
      } else if (object.type === ObjectType.WOODY_ROOT) {
        targetText = "Target: Woody Roots";
      } else if (object.type === ObjectType.MUSHROOM) {
        targetText = "Target: Mushroom";
      } else if (object.type === ObjectType.PICKUP) {
        const pickupId = object.data.resourceId;
        const pickupLabel = RESOURCE_DEFINITIONS[pickupId]?.label ?? "Item";
        const amount = object.data.amount ?? 1;
        targetText = `Target: ${pickupLabel} Pickup x${amount}`;
      } else if (object.type === ObjectType.STONE_CUTTER) {
        const ingredients = object.data.ingredients?.length ?? 0;
        targetText = `Target: Stone Cutter Workbench (${ingredients}/6)`;
      } else if (object.type === ObjectType.SMELTER) {
        targetText = "Target: Smelter Workbench";
      } else if (object.type === ObjectType.STOVE) {
        targetText = "Target: Stove Workbench";
      } else if (object.type === ObjectType.CONSTRUCTION_BENCH) {
        const ingredients = object.data.ingredients?.length ?? 0;
        targetText = `Target: Construction Workbench (${ingredients}/8)`;
      } else if (object.type === ObjectType.SMALL_CHEST) {
        const stored = object.data?.slots?.filter((item) => !!item).length ?? 0;
        targetText = `Target: Small Chest (${stored}/12)`;
      } else if (object.type === ObjectType.WALL_SEGMENT) {
        targetText = "Target: Constructed Wall Segment";
      } else if (object.type === ObjectType.DOOR) {
        targetText = `Target: Constructed Door (${object.data?.open ? "Open" : "Closed"})`;
      }
    }

    this.status.innerHTML = [
      `<div>Area: <strong style="color: ${areaColor}">${areaName}</strong> (${areaRule})</div>`,
      `<div>Resources: Cut Stone ${state.resources[ResourceId.STONE]} | Raw Stone ${state.resources[ResourceId.STONE_BLOCK]} | Wood ${state.resources[ResourceId.WOODY_ROOT]} | Mushroom ${state.resources[ResourceId.MUSHROOM]} | Meat ${state.resources[ResourceId.MEAT]} | Stew ${state.resources[ResourceId.SIMPLE_STEW]} | Chest ${state.resources[ResourceId.SMALL_CHEST]} | Wall Kit ${state.resources[ResourceId.WALL_KIT]} | Door ${state.resources[ResourceId.DOOR_KIT]}</div>`,
      `<div>Ores: Cu ${state.resources[ResourceId.COPPER_ORE]} | Zn ${state.resources[ResourceId.ZINC_ORE]} | Fe ${state.resources[ResourceId.IRON_ORE]} | Ingots: Cu ${state.resources[ResourceId.COPPER_INGOT]} | Zn ${state.resources[ResourceId.ZINC_INGOT]} | Fe ${state.resources[ResourceId.IRON_INGOT]}</div>`,
      `<div>Coins: Cu ${state.resources[ResourceId.COPPER_COIN]} | Ag ${state.resources[ResourceId.SILVER_COIN]} | Au ${state.resources[ResourceId.GOLD_COIN]}</div>`,
      `<div>HP: ${Math.ceil(state.player.health)}/${state.player.maxHealth} | Kills: ${state.combat?.kills ?? 0} | Hostiles: ${hostileCount}</div>`,
      `<div>NPC Types: Hostile ${npcSummary.hostile} | Agnostic ${npcSummary.agnostic} | Allied ${npcSummary.allied}</div>`,
      `<div>Selected: ${selectedActionLabel} | Equipped Tool: ${equippedToolName} | Hammer Build: ${buildName}</div>`,
      `<div>${targetText}</div>`,
      `<div>Position: ${state.player.x.toFixed(1)}, ${state.player.y.toFixed(1)} | Mouse: ${state.pointerLocked ? "Locked" : "Free"}</div>`,
    ].join("");
  }

  setPlayerBars(player) {
    if (!player) {
      return;
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const updateBar = (fillNode, valueNode, value, max) => {
      if (!fillNode || !valueNode) {
        return;
      }

      const safeMax = Math.max(1, max ?? 0);
      const safeValue = clamp(value ?? 0, 0, safeMax);
      const percent = (safeValue / safeMax) * 100;
      fillNode.style.width = `${percent.toFixed(1)}%`;
      valueNode.textContent = `${Math.ceil(safeValue)}/${safeMax}`;
    };

    updateBar(this.healthBarFill, this.healthBarValue, player.health, player.maxHealth);
    updateBar(this.staminaBarFill, this.staminaBarValue, player.stamina, player.maxStamina);
    updateBar(this.manaBarFill, this.manaBarValue, player.mana, player.maxMana);
  }

  formatEffectTime(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(seconds ?? 0));
    if (safeSeconds >= 60) {
      const minutes = Math.floor(safeSeconds / 60);
      const remain = String(safeSeconds % 60).padStart(2, "0");
      return `${minutes}:${remain}`;
    }

    return `${safeSeconds}s`;
  }

  setPlayerEffects(player) {
    if (!this.effectsList) {
      return;
    }

    const entriesByKey = new Map();
    const addOrUpdateEntry = (effect, fallback = {}) => {
      if (!effect || (effect.remainingTime ?? 0) <= 0) {
        return;
      }

      const key = effect.effectId ?? effect.label ?? fallback.key ?? "effect";
      const current = entriesByKey.get(key);
      if (!current) {
        entriesByKey.set(key, {
          key,
          icon: effect.icon ?? fallback.icon ?? "EF",
          label: effect.label ?? fallback.label ?? "Effect",
          type: effect.type ?? fallback.type ?? "neutral",
          remaining: effect.remainingTime ?? 0,
          stack: 1,
        });
      } else {
        current.stack += 1;
        current.remaining = Math.max(current.remaining, effect.remainingTime ?? 0);
      }
    };

    const activeHeals = player?.activeHeals ?? [];
    for (const effect of activeHeals) {
      if (!effect || (effect.remainingHeal ?? 0) <= 0) {
        continue;
      }

      addOrUpdateEntry(effect, {
        key: "heal",
        icon: "HE",
        label: "Healing",
        type: "heal",
      });
    }

    const statusEffects = player?.statusEffects ?? [];
    for (const effect of statusEffects) {
      addOrUpdateEntry(effect, {
        key: "status",
        icon: "EF",
        label: "Status",
        type: "neutral",
      });
    }

    const entries = Array.from(entriesByKey.values()).sort((a, b) => b.remaining - a.remaining);
    const signature = JSON.stringify(entries.map((entry) => [entry.key, entry.stack, Math.round(entry.remaining)]));
    if (signature === this.effectsSignature) {
      return;
    }

    this.effectsSignature = signature;
    this.effectsList.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "effects-empty";
      empty.textContent = "No Effects";
      this.effectsList.append(empty);
      return;
    }

    for (const entry of entries) {
      const tile = document.createElement("div");
      tile.className = `effect-tile ${entry.type}`;
      tile.title = `${entry.label} (${this.formatEffectTime(entry.remaining)})`;
      tile.innerHTML = `<span class="effect-icon">${entry.icon}</span><span class="effect-name">${entry.label}</span><span class="effect-time">${this.formatEffectTime(entry.remaining)}</span>${entry.stack > 1 ? `<span class="effect-stack">x${entry.stack}</span>` : ""}`;
      this.effectsList.append(tile);
    }
  }

  setPointerLock(pointerLocked) {
    this.help.style.opacity = pointerLocked ? "0.56" : "1";
  }

  pushMessage(text) {
    this.messageLog.unshift(text);
    this.messageLog = this.messageLog.slice(0, 6);
    this.messages.innerHTML = this.messageLog.map((message) => `<p>${message}</p>`).join("");
  }

  renderInventory(container, inventorySlots) {
    container.innerHTML = "";

    for (let i = 0; i < inventorySlots.length; i += 1) {
      const slotData = inventorySlots[i];
      const count = slotData?.count ?? 0;
      const itemClass = slotData?.className ?? "";

      const slot = document.createElement("div");
      slot.className = `inventory-slot ${itemClass} ${slotData ? "filled" : "empty"}`;

      if (!slotData) {
        slot.innerHTML = `<span class="inventory-slot-index">${i + 1}</span>`;
      } else {
        const countText = slotData.itemKind === "resource" ? `x${count}` : "Tool";
        slot.innerHTML = `<span class="res-symbol">${slotData.icon}</span><span class="res-count">${countText}</span><span class="res-name">${slotData.label}</span><span class="inventory-slot-index">${i + 1}</span>`;
        slot.draggable = true;
        slot.addEventListener("dragstart", (event) => {
          const payload = {
            type: "inventory-item",
            item: {
              kind: slotData.itemKind,
              id: slotData.itemId,
            },
          };
          this.activeDragPayload = payload;
          setDragPayload(event, payload);
        });
        slot.addEventListener("dragend", () => {
          this.activeDragPayload = null;
        });
      }

      container.append(slot);
    }
  }

  renderSlots(container, context) {
    container.innerHTML = "";

    for (let i = 0; i < context.maxSlots; i += 1) {
      const resourceId = context.slots[i] ?? null;
      const resourceDef = resourceId ? RESOURCE_DEFINITIONS[resourceId] : null;

      const slot = document.createElement("div");
      slot.className = `craft-slot ${resourceDef ? resourceDef.className : ""}`;
      slot.innerHTML = resourceDef
        ? `<span class="res-symbol">${resourceDef.icon}</span><span class="slot-index">${i + 1}</span>`
        : `<span class="slot-index">${i + 1}</span>`;

      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });

      slot.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = payloadFromEvent(event, this.activeDragPayload);
        this.activeDragPayload = null;
        if (!payload) {
          return;
        }

        if (payload.type === "inventory-item") {
          if (payload.item?.kind !== "resource") {
            return;
          }

          this.emit({
            type: "drop-resource",
            contextId: context.contextId,
            slotIndex: i,
            resourceId: payload.item.id,
          });
          return;
        }

        if (payload.type === "slot-resource") {
          this.emit({
            type: "move-slot",
            fromContextId: payload.contextId,
            fromSlotIndex: payload.slotIndex,
            toContextId: context.contextId,
            toSlotIndex: i,
          });
        }
      });

      if (resourceDef) {
        slot.draggable = true;
        slot.addEventListener("dragstart", (event) => {
          const payload = {
            type: "slot-resource",
            contextId: context.contextId,
            slotIndex: i,
            resourceId,
          };
          this.activeDragPayload = payload;
          setDragPayload(event, payload);
        });
        slot.addEventListener("dragend", () => {
          this.activeDragPayload = null;
        });

        slot.addEventListener("click", () => {
          this.emit({
            type: "return-slot",
            contextId: context.contextId,
            slotIndex: i,
          });
        });
      }

      container.append(slot);
    }
  }

  renderRecipes(container, context) {
    container.innerHTML = "";

    for (const recipe of context.recipes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `recipe-button ${recipe.id === context.selectedRecipeId ? "selected" : ""} ${recipe.canCraft ? "craftable" : ""}`;
      button.innerHTML = `<strong>${recipe.name}</strong><span>${recipe.requires} -> ${recipe.produces}</span>`;
      button.addEventListener("click", () => {
        this.emit({
          type: "select-recipe",
          contextId: context.contextId,
          recipeId: recipe.id,
        });
      });
      container.append(button);
    }
  }

  renderHammerBuilds(builds = []) {
    this.hammerBuildList.innerHTML = "";

    for (const build of builds) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `build-picker-btn ${build.selected ? "selected" : ""} ${build.affordable ? "" : "unaffordable"}`;
      button.innerHTML = `<strong>${build.name}</strong><small>Cost: ${build.costText}</small>`;
      button.addEventListener("click", () => {
        this.emit({
          type: "select-build",
          buildId: build.id,
        });
      });
      this.hammerBuildList.append(button);
    }
  }

  renderQuestJournal(journal) {
    const selectedTab = journal?.selectedTab === "completed" ? "completed" : "active";
    const entries = selectedTab === "completed" ? (journal?.completed ?? []) : (journal?.active ?? []);

    this.questTabActive?.classList.toggle("selected", selectedTab === "active");
    this.questTabCompleted?.classList.toggle("selected", selectedTab === "completed");

    if (!this.questJournalList) {
      return;
    }

    this.questJournalList.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "quest-empty";
      empty.textContent = selectedTab === "completed" ? "No completed quests." : "No active quests.";
      this.questJournalList.append(empty);
      return;
    }

    for (const quest of entries) {
      const entry = document.createElement("article");
      entry.className = "quest-entry";
      entry.innerHTML = `<h5>${quest.title}</h5><p class="quest-meta">${quest.meta}</p><p class="quest-stage">${quest.stage}</p>`;
      this.questJournalList.append(entry);
    }
  }

  installDragDropGuards() {
    const suppressBrowserDrop = (event) => {
      event.preventDefault();
    };

    document.addEventListener("dragover", suppressBrowserDrop, { capture: true });
    document.addEventListener("drop", suppressBrowserDrop, { capture: true });
    document.addEventListener(
      "dragend",
      () => {
        this.activeDragPayload = null;
      },
      { capture: true },
    );
  }

  bringWindowToFront(windowNode) {
    if (!windowNode) {
      return;
    }

    this.windowDragZ += 1;
    windowNode.style.zIndex = String(this.windowDragZ);
  }

  beginWindowDrag(windowNode, event) {
    if (!windowNode) {
      return;
    }

    const rect = windowNode.getBoundingClientRect();
    windowNode.style.left = `${rect.left}px`;
    windowNode.style.top = `${rect.top}px`;
    windowNode.style.right = "auto";
    windowNode.style.bottom = "auto";
    this.bringWindowToFront(windowNode);

    this.draggedWindow = {
      id: windowNode.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  }

  updateWindowDrag(event) {
    if (!this.draggedWindow || event.pointerId !== this.draggedWindow.pointerId) {
      return;
    }

    const windowNode = document.getElementById(this.draggedWindow.id);
    if (!windowNode) {
      this.draggedWindow = null;
      return;
    }

    const rect = windowNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nextLeft = event.clientX - this.draggedWindow.offsetX;
    const nextTop = event.clientY - this.draggedWindow.offsetY;
    const clampedLeft = Math.max(0, Math.min(nextLeft, viewportWidth - rect.width));
    const clampedTop = Math.max(0, Math.min(nextTop, viewportHeight - rect.height));

    windowNode.style.left = `${clampedLeft}px`;
    windowNode.style.top = `${clampedTop}px`;
  }

  endWindowDrag(event) {
    if (!this.draggedWindow) {
      return;
    }

    if (event && event.pointerId !== this.draggedWindow.pointerId) {
      return;
    }

    this.draggedWindow = null;
  }

  installWindowDragging() {
    const windows = [this.playerWindow, this.objectWindow, this.hammerWindow, this.questWindow].filter(Boolean);

    for (const windowNode of windows) {
      const header = windowNode.querySelector(".window-header");
      if (!header) {
        continue;
      }

      header.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        if (event.target.closest(".window-close")) {
          return;
        }

        event.preventDefault();
        this.beginWindowDrag(windowNode, event);
      });
    }

    document.addEventListener("pointermove", (event) => {
      this.updateWindowDrag(event);
    });
    document.addEventListener("pointerup", (event) => {
      this.endWindowDrag(event);
    });
    document.addEventListener("pointercancel", (event) => {
      this.endWindowDrag(event);
    });
  }
  setWindowState(windowState) {
    const signature = JSON.stringify(windowState);
    if (signature === this.windowSignature) {
      return;
    }

    this.windowSignature = signature;

    this.renderActionSlots(
      windowState.toolbarSlots ?? [],
      windowState.hotbarSlots ?? [],
      windowState.activeHotbarIndex ?? 0,
      windowState.hotbarCount ?? 1,
    );
    this.setToolbarActive(windowState.selectedToolbarSlot ?? 0);

    this.playerWindow.classList.toggle("hidden", !windowState.playerOpen);
    this.hammerWindow.classList.toggle("hidden", !windowState.hammerOpen);
    this.objectWindow.classList.toggle("hidden", !windowState.objectOpen);
    this.questWindow.classList.toggle("hidden", !windowState.questOpen);

    if (windowState.playerOpen && windowState.playerContext) {
      this.renderInventory(this.playerInventory, windowState.inventorySlots);
      this.renderSlots(this.playerSlots, windowState.playerContext);
      this.renderRecipes(this.playerRecipes, windowState.playerContext);
      this.playerCraftButton.disabled = !windowState.playerContext.canCraftSelected;
    }

    if (windowState.hammerOpen) {
      this.renderHammerBuilds(windowState.hammerBuildOptions);
    }

    if (windowState.objectOpen && windowState.objectContext) {
      this.objectTitle.textContent = windowState.objectContext.title;
      this.objectSubtitle.textContent = windowState.objectContext.subtitle;
      this.objectSettings.textContent = windowState.objectContext.settings;

      this.renderInventory(this.objectInventory, windowState.inventorySlots);
      this.renderSlots(this.objectSlots, windowState.objectContext);
      this.renderRecipes(this.objectRecipes, windowState.objectContext);
      this.objectCraftButton.disabled = !windowState.objectContext.canCraftSelected;
    }

    if (windowState.questOpen) {
      this.renderQuestJournal(windowState.questJournal);
    }
  }
}
