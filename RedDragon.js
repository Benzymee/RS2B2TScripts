// packages/rs2b0t-api/index.js
var SUPPORTED_API_VERSION = 1;
var abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("@rs2b0t/api: globalThis.__rs2b0t is missing — this script must be loaded inside the rs2b0t bot client (bot.html)");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(`@rs2b0t/api: client ABI version ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION} — update @rs2b0t/api or the client`);
}
var {
  apiVersion,
  Execution,
  defineBot,
  registerScript,
  events,
  Game,
  Tile,
  Area,
  Traversal,
  NAV_PURE_WALK,
  NAV_WITH_TELES,
  DirectNavigator,
  Npcs,
  Players,
  Locs,
  GroundItems,
  EntityQuery,
  Npc,
  Player,
  Loc,
  GroundItem,
  Inventory,
  InvItem,
  Equipment,
  Bank,
  withdrawOp,
  Banking,
  depositAllExcept,
  depositMatcher,
  matchesCommonBankLoot,
  shouldBankNow,
  parseBankStrategy,
  PERIODIC_BANK_SETTINGS,
  COMMON_BANK_LOOT,
  RANDOM_EVENT_CASKET_ID,
  NEARBY_BANK_RADIUS,
  resolveBankOpenRoute,
  BANK_LOCATIONS,
  bankDistance,
  bankUnlocked,
  nearestBank,
  nearestUsableBank,
  Shop,
  Trade,
  Skills,
  ChatDialog,
  Quests,
  AcquireTask,
  hasAll,
  held,
  PICKAXES,
  AXES,
  TINDERBOX,
  HAMMER,
  KNIFE,
  CHISEL,
  NEEDLE,
  pickaxeReq,
  axeReq,
  exactTool,
  tinderboxReq,
  toolAttackLevel,
  canWieldTool,
  bestFromTiers,
  bestPickaxe,
  bestAxe,
  toolKeepNames,
  hasToolReq,
  hasAllTools,
  missingToolLabels,
  toolKitLabel,
  toolRestockPlan,
  bankHasBetterGatherTool,
  toolsNeedingEquip,
  bestHeldToolNames,
  surplusHeldToolNames,
  COINS,
  BROKEN_PICKAXE,
  BROKEN_AXE,
  parseToolAcquireMode,
  TOOL_ACQUIRE_OPTIONS,
  TOOL_ACQUIRE_SETTING,
  FORGETFUL_BANK_ODDS,
  FORGETFUL_BANK_SETTING,
  BOB_VENDOR,
  NURMOF_VENDOR,
  GERRANT_VENDOR,
  HARRY_VENDOR,
  GERRANT_ONLY_FISHING,
  VARROCK_ANVIL_STAND,
  VARROCK_ANVIL_BANK,
  PICKAXE_SHOP_COSTS,
  AXE_SHOP_COSTS,
  FISHING_SHOP_COSTS,
  AXE_SMITH_LEVEL,
  AXE_BAR_FOR,
  bestOwnedTier,
  pickaxeShopOffers,
  axeShopOffers,
  bestAffordableShopTier,
  bestSmithableAxe,
  planBrokenToolRepair,
  planPickaxeAcquire,
  planAxeAcquire,
  fishingVendorFor,
  fishingShopCost,
  isFishingBaitPiece,
  withBaitTarget,
  planFishingGearBuys,
  planFishingGearAcquire,
  buyPlansCost,
  fishingGearShopCart,
  planGatherToolAcquire,
  coinsToWithdraw,
  canFundPlan,
  acquireKeepNames,
  shopableMissingFishingGear,
  PICKPOCKET_TARGETS,
  PICKPOCKET_TARGET_NAMES,
  ARDOUGNE_PICKPOCKET_TARGETS,
  DEFAULT_BOOTH_NAME,
  DEFAULT_BOOTH_OP,
  MAP_SQUARE,
  sameMapSquare,
  locationOptions,
  boothFields,
  resolveGatheringLocation,
  FISHING_LOCATIONS,
  FISHING_LOCATION_OPTIONS,
  resolveFishingLocation,
  MINING_LOCATIONS,
  MINING_LOCATION_OPTIONS,
  MINING_LOCATION_OPTION_LABELS,
  miningLocationLabel,
  resolveMiningLocation,
  WOODCUTTING_LOCATIONS,
  WOODCUTTING_LOCATION_OPTIONS,
  resolveWoodcuttingLocation,
  WHIRLPOOL_IDS,
  FISHING_METHODS,
  FISHING_METHOD_OPTIONS,
  ALL_FISHING_GEAR_NAMES,
  resolveFishMethod,
  gearKeepNames,
  hasFishingGear,
  missingFishingGear,
  gearLabel,
  fishingRestockPlan,
  spotMatchesMethod,
  ROCK_TYPES,
  ROCK_OPTIONS,
  GAS_ROCK_IDS,
  GAS_ROCK_TICKS,
  resolveRockIds,
  WALK_DESTINATIONS,
  WALK_OPTIONS,
  resolveDestination,
  COW_LOCATIONS,
  COW_LOCATION_OPTIONS,
  AL_KHARID_BANK,
  TOLL_COIN_TARGET,
  isCowFieldLootTile,
  resolveCowLocation,
  nearestCowLocation,
  needsTollCoins,
  shouldBootstrapTollCoins,
  RUNES,
  RUNE_OPTIONS,
  DEFAULT_RUNE,
  AbstractBot,
  LoopingBot,
  TaskBot,
  TreeBot,
  BranchTask,
  LeafTask,
  reader
} = abi;

// loadable/RedDragon.ts
var SCRIPT_NAME = "RedDragon";
var TARGET = "Red dragon";
var DEFAULT_ANCHOR = new Tile(3202, 3833, 0);
var DEFAULT_BANK = new Tile(3094, 3493, 0);
var FIELD_RADIUS = 28;
var AT_BANK_RADIUS = 8;
var RETURN_HOLD_MS = 60000;
var WILDY_MIN_Z = 3520;
var TELE_SAFE_Z = 3665;
var TELE_STOCK = 2;
var BONE_NAME = "Dragon bones";
var HIDE_NAME = "Dragonhide";
var SHIELD_DEFAULT = "Anti-dragon shield";
var GAME_VIEW = { x: 4, y: 4, w: 512, h: 334 };
var PAINT_W = 248;
var PAINT_H = 92;
var FOOD_OPTIONS = [
  "Shark",
  "Lobster",
  "Swordfish",
  "Tuna",
  "Salmon",
  "Trout",
  "Pike",
  "Bass",
  "Cake",
  "Chocolate cake",
  "Plain pizza",
  "Meat pizza",
  "Anchovy pizza"
];
var DROPS = [
  "Adamant platebody",
  "Adamantite bar",
  "Blood rune",
  "Chaos talisman",
  "Chocolate cake",
  "Coins",
  "Death rune",
  "Dragon bones",
  "Dragon spear",
  "Dragonhide",
  "Half of a key",
  "Herb",
  "Law rune",
  "Mithril 2h sword",
  "Mithril axe",
  "Mithril battleaxe",
  "Mithril javelin",
  "Mithril kiteshield",
  "Nature talisman",
  "Rune arrow",
  "Rune dart",
  "Rune javelin",
  "Rune longsword",
  "Rune spear",
  "Shield left half",
  "Uncut diamond",
  "Uncut emerald",
  "Uncut ruby",
  "Uncut sapphire"
];
var DEFAULT_LOOT = DROPS.filter((n) => n.toLowerCase() !== "chocolate cake");
var VARROCK_TELE_RUNES = [
  { rune: "Law rune", count: 1 },
  { rune: "Air rune", count: 3 },
  { rune: "Fire rune", count: 1 }
];
var MELEE_WEAPONS = [
  "Rune scimitar",
  "Rune longsword",
  "Rune sword",
  "Dragon longsword",
  "Dragon dagger",
  "Dragon dagger(p)",
  "Adamant scimitar",
  "Mithril scimitar",
  "Black scimitar",
  "Steel scimitar"
];
var STAFFS = ["Staff of fire", "Staff of air", "Staff of water", "Staff of earth", "Battlestaff", "Fire battlestaff"];
var SPELLS = ["Fire Strike", "Fire Bolt", "Fire Blast", "Wind Strike", "Wind Bolt", "Wind Blast"];
var SHOW_MAGE = { key: "combatStyle", anyOf: ["mage"] };
var SHOW_MELEE = { key: "combatStyle", anyOf: ["melee"] };
var FOOD_FORMS = {
  cake: ["cake", "2/3 cake", "slice of cake"],
  "chocolate cake": ["chocolate cake", "2/3 chocolate cake", "chocolate slice"],
  "plain pizza": ["plain pizza", "1/2 plain pizza"],
  "meat pizza": ["meat pizza", "1/2 meat pizza"],
  "anchovy pizza": ["anchovy pizza", "1/2 anchovy pizza"]
};
var SETTINGS = {
  combatStyle: { type: "string", default: "melee", options: ["melee", "mage"], label: "Combat style", help: "range is unavailable — a bow blocks the anti-dragon shield slot" },
  meleeStyle: { type: "string", default: "strength", options: ["attack", "strength", "controlled", "defence"], label: "Melee style", group: "Combat", showIf: SHOW_MELEE },
  weapon: { type: "string", default: "Rune scimitar", options: MELEE_WEAPONS, label: "Weapon", group: "Combat", showIf: SHOW_MELEE, help: "1-handed so the shield slot stays free" },
  staff: { type: "string", default: "Staff of fire", options: STAFFS, label: "Staff", group: "Combat", showIf: SHOW_MAGE },
  spell: { type: "string", default: "Fire Strike", options: SPELLS, label: "Spell", group: "Combat", showIf: SHOW_MAGE },
  shield: { type: "string", default: SHIELD_DEFAULT, options: ["Anti-dragon shield", "Dragonfire shield"], label: "Anti-dragon shield", group: "Combat", help: "worn to absorb dragonfire — required" },
  food: { type: "string", default: "Lobster", options: FOOD_OPTIONS, label: "Food", group: "Food & healing" },
  foodWithdraw: { type: "number", default: 20, min: 1, max: 27, label: "Food to withdraw per bank run", group: "Food & healing" },
  eatAtPercent: { type: "number", default: 55, min: 10, max: 95, label: "Eat at HP%", group: "Food & healing" },
  panicHp: { type: "number", default: 30, min: 1, max: 98, label: "Escape below HP%", group: "Food & healing", help: "when out of food and this low, escape to the bank" },
  foodReserve: { type: "number", default: 4, min: 0, max: 27, label: "Food kept back from slot-freeing", group: "Food & healing" },
  escape: { type: "string", default: "Flee to bank", options: ["Flee to bank", "Teleport to Varrock"], label: "Escape mode", group: "Wilderness", help: "Teleport brings Varrock runes and runs south to level 20 to cast" },
  loot: { type: "string[]", default: DEFAULT_LOOT, options: DROPS, label: "Loot to pick up (drop table)", group: "Banking & loot" },
  buryBones: { type: "boolean", default: false, label: "Bury dragon bones", group: "Banking & loot" },
  bankCommonJunk: { type: "boolean", default: true, label: "Also grab shared gems/junk", group: "Banking & loot" },
  anchorTile: { type: "tile", default: DEFAULT_ANCHOR, label: "Red Dragon Isle tile", group: "Location" },
  bankTile: { type: "tile", default: DEFAULT_BANK, label: "Bank stand tile (Edgeville)", group: "Location" }
};
function foodForms(food) {
  return FOOD_FORMS[food.toLowerCase()] ?? [food.toLowerCase()];
}
function isFoodItem(name, food) {
  return foodForms(food).includes((name ?? "").toLowerCase());
}
function inWilderness(z) {
  return z > WILDY_MIN_Z;
}

class RedDragon extends TaskBot {
  loopDelay = 600;
  status = "starting";
  style = "melee";
  meleeStyle = "strength";
  weapon = "";
  shield = SHIELD_DEFAULT;
  spell = "Fire Strike";
  food = "Lobster";
  foodWithdraw = 20;
  eatAt = 0.55;
  panicHp = 0.3;
  foodReserve = 4;
  teleEscape = false;
  buryBones = false;
  bankCommon = true;
  lootSet = new Set;
  anchor = DEFAULT_ANCHOR;
  bankTile = DEFAULT_BANK;
  trackedGear = [];
  holdReturnUntil = 0;
  died = false;
  kills = 0;
  looted = 0;
  bankTrips = 0;
  targetIdx = null;
  bankEmpty = false;
  startedAt = Date.now();
  lootCounts = new Map;
  grindTargets() {
    return [TARGET.toLowerCase()];
  }
  recoveryAnchor() {
    return this.bankTile;
  }
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    this.style = this.settings.str("combatStyle", "melee") === "mage" ? "mage" : "melee";
    const ms = this.settings.str("meleeStyle", "strength");
    this.meleeStyle = ["attack", "strength", "controlled", "defence"].includes(ms) ? ms : "strength";
    this.spell = this.settings.str("spell", "Fire Strike");
    this.weapon = this.style === "mage" ? this.settings.str("staff", "Staff of fire") : this.settings.str("weapon", "Rune scimitar");
    this.shield = this.settings.str("shield", SHIELD_DEFAULT);
    this.food = this.settings.str("food", "Lobster");
    this.foodWithdraw = this.settings.num("foodWithdraw", 20);
    this.eatAt = this.settings.num("eatAtPercent", 55) / 100;
    this.panicHp = this.settings.num("panicHp", 30) / 100;
    this.foodReserve = this.settings.num("foodReserve", 4);
    this.teleEscape = this.settings.str("escape", "Flee to bank") === "Teleport to Varrock";
    this.buryBones = this.settings.bool("buryBones", false);
    this.bankCommon = this.settings.bool("bankCommonJunk", true);
    this.lootSet = new Set(this.settings.list("loot", DEFAULT_LOOT).map((s) => s.toLowerCase()));
    this.anchor = this.settings.tile("anchorTile", DEFAULT_ANCHOR);
    this.bankTile = this.settings.tile("bankTile", DEFAULT_BANK);
    this.trackedGear = Equipment.items().map((i) => i.name ?? "").filter((n) => n.length > 0);
    this.on("chat.message", (e) => {
      if (/oh dear.*you are dead/i.test(e.text)) {
        this.died = true;
      }
    });
    if (!Game.autoRetaliateOn()) {
      Game.setAutoRetaliate(true);
    }
    this.log(`${SCRIPT_NAME} — ${this.style} w/ ${this.weapon} + ${this.shield}, food '${this.food}', field ${this.anchor}`);
    this.add({ validate: () => ChatDialog.canContinue(), execute: async () => {
      this.status = "dialog";
      await ChatDialog.continue();
    } }, { validate: () => this.died, execute: async () => this.recoverDeath() }, { validate: () => this.escapeNeeded(), execute: async () => this.escape() }, { validate: () => this.needEat(), execute: async () => {
      this.status = "eating";
      await this.eatOnce();
    } }, { validate: () => this.missingGear() !== null, execute: async () => this.equipMissing() }, { validate: () => this.style === "melee" && !Game.hasCombatStyle(this.meleeStyle), execute: async () => {
      Game.setCombatStyle(this.meleeStyle);
      await Execution.delayUntil(() => Game.hasCombatStyle(this.meleeStyle), 2000);
    } }, { validate: () => this.buryBones && Inventory.contains(BONE_NAME) && !this.underAttack(), execute: async () => this.buryOnce() }, { validate: () => this.shouldBank(), execute: async () => this.bankRoutine() }, { validate: () => this.findLoot() !== null && !Inventory.isFull() && !this.underAttack(), execute: async () => this.lootOnce() }, { validate: () => !this.underAttack() && this.hpFrac() >= this.panicHp && this.fieldDragons().length > 0, execute: async () => this.fight() }, { validate: () => this.shouldReturn(), execute: async () => this.returnToField() });
  }
  hpFrac() {
    return Skills.hpFraction();
  }
  foodCount() {
    return Inventory.items().filter((i) => isFoodItem(i.name, this.food)).length;
  }
  inField(tile) {
    return this.anchor.distanceTo(tile) <= FIELD_RADIUS;
  }
  atBank() {
    const here = Game.tile();
    return here !== null && this.bankTile.distanceTo(here) <= AT_BANK_RADIUS;
  }
  underAttack() {
    const z = Game.tile()?.z ?? null;
    return z !== null && Game.attackedByPlayer() && inWilderness(z);
  }
  fieldDragons() {
    return Npcs.query().name(TARGET).where((n) => this.inField(n.tile()) && !n.targetsAnotherPlayer()).results();
  }
  wantsLoot(item) {
    const n = (item.name ?? "").toLowerCase();
    if (n.length === 0) {
      return false;
    }
    if (this.buryBones && n === BONE_NAME.toLowerCase()) {
      return true;
    }
    return this.lootSet.has(n) || this.bankCommon && matchesCommonBankLoot(item.name ?? "", item.id);
  }
  findLoot() {
    return GroundItems.query().where((g) => this.wantsLoot(g)).within(FIELD_RADIUS).nearest();
  }
  needEat() {
    return this.foodCount() > 0 && this.hpFrac() <= this.eatAt;
  }
  keepNames() {
    const names = [this.weapon, this.shield, this.food, ...this.trackedGear];
    if (this.teleEscape) {
      names.push(...VARROCK_TELE_RUNES.map((r) => r.rune));
    }
    if (this.style === "mage") {
      names.push(this.spell.includes("Fire") ? "Fire rune" : this.spell.includes("Water") ? "Water rune" : "Air rune", "Mind rune", "Chaos rune", "Death rune");
    }
    const out = [];
    for (const name of names) {
      if (name !== "" && !out.some((s) => s.toLowerCase() === name.toLowerCase())) {
        out.push(name);
      }
    }
    return out;
  }
  missingGear() {
    return [this.weapon, this.shield, ...this.trackedGear].find((n) => n !== "" && !Equipment.contains(n) && Inventory.first(n) !== null) ?? null;
  }
  escapeNeeded() {
    if (this.underAttack()) {
      return true;
    }
    return !this.atBank() && this.hpFrac() < this.panicHp && this.foodCount() === 0;
  }
  shouldBank() {
    if (this.underAttack()) {
      return false;
    }
    if (this.foodCount() === 0 && !this.bankEmpty) {
      return true;
    }
    return Inventory.isFull() && this.foodCount() <= this.foodReserve;
  }
  shouldReturn() {
    const here = Game.tile();
    if (here === null || Game.inCombat() || this.anchor.distanceTo(here) <= FIELD_RADIUS + 6) {
      return false;
    }
    return Date.now() >= this.holdReturnUntil;
  }
  hasVarrockRunes() {
    return VARROCK_TELE_RUNES.every((r) => Inventory.count(r.rune) >= r.count);
  }
  async eatOnce() {
    const food = Inventory.items().find((i) => isFoodItem(i.name, this.food));
    if (!food) {
      return false;
    }
    this.status = `eating ${food.name}`;
    const before = Skills.effective("hitpoints");
    await food.interact("Eat");
    return Execution.delayUntil(() => Skills.effective("hitpoints") > before, 3000);
  }
  async buryOnce() {
    const bones = Inventory.first(BONE_NAME);
    if (!bones) {
      return;
    }
    this.status = `burying ${BONE_NAME}`;
    const before = Inventory.used();
    await bones.interact("Bury");
    await Execution.delayUntil(() => Inventory.used() < before, 3000);
  }
  async equipMissing() {
    const item = this.missingGear();
    if (item === null) {
      return;
    }
    this.status = `equipping ${item}`;
    await Equipment.equip(item);
  }
  async lootOnce() {
    const drop = this.findLoot();
    if (!drop) {
      return;
    }
    this.status = `looting ${drop.name}`;
    const before = Inventory.used();
    await drop.interact("Take");
    if (await Execution.delayUntil(() => Inventory.used() > before, 4000)) {
      this.looted++;
      const name = drop.name ?? "?";
      this.lootCounts.set(name, (this.lootCounts.get(name) ?? 0) + 1);
    }
  }
  async freeSlot() {
    if (!Inventory.isFull() || this.findLoot() === null || this.foodCount() <= this.foodReserve) {
      return false;
    }
    if (this.hpFrac() < 1) {
      return this.eatOnce();
    }
    const food = Inventory.items().find((i) => isFoodItem(i.name, this.food));
    if (!food) {
      return false;
    }
    this.status = `dropping ${food.name}`;
    const before = Inventory.used();
    await food.interact("Drop");
    return Execution.delayUntil(() => Inventory.used() < before, 3000);
  }
  async recoverDeath() {
    this.status = "died — recovering";
    this.log("died — walking to the bank");
    await Traversal.walkResilient(this.bankTile, { radius: 6, attempts: 8, timeoutMs: 240000, log: (m) => this.log(`  ${m}`) });
    this.died = false;
    Game.setAutoRetaliate(true);
  }
  async escape() {
    if (this.underAttack()) {
      this.holdReturnUntil = Date.now() + RETURN_HOLD_MS;
    }
    if (this.teleEscape && this.hasVarrockRunes()) {
      const me = Game.tile();
      if (me && me.z > TELE_SAFE_Z) {
        this.status = "escaping — south to tele range";
        await Traversal.walkResilient(new Tile(this.anchor.x, TELE_SAFE_Z - 5, 0), { radius: 4, attempts: 3, timeoutMs: 60000, log: (m) => this.log(`  ${m}`) });
        return;
      }
      this.status = "escaping — Varrock teleport";
      const before = Game.tile();
      if (await Game.teleport("Varrock")) {
        if (await Execution.delayUntil(() => {
          const t = Game.tile();
          return t !== null && before !== null && Tile.from(t).distanceTo(Tile.from(before)) > 40;
        }, 4000)) {
          return;
        }
      }
    }
    this.status = "escaping — flee to bank";
    await Traversal.walkResilient(this.bankTile, { radius: 3, attempts: 6, timeoutMs: 240000, log: (m) => this.log(`  ${m}`) });
  }
  async withdrawTo(name, target) {
    for (let guard = 0;guard < 20 && Inventory.count(name) < target && !Inventory.isFull(); guard++) {
      const before = Inventory.count(name);
      const need = target - before;
      if (need > 10 && await Bank.withdrawX(name, need)) {
        if (Inventory.count(name) > before) {
          continue;
        }
        break;
      }
      await Bank.withdraw(name, need >= 10 ? "Withdraw-10" : need >= 5 ? "Withdraw-5" : "Withdraw-1");
      if (!await Execution.delayUntil(() => Inventory.count(name) > before, 2500)) {
        break;
      }
    }
  }
  async withdrawFood() {
    for (let guard = 0;guard < 12 && this.foodCount() < this.foodWithdraw && !Inventory.isFull(); guard++) {
      const before = this.foodCount();
      const need = this.foodWithdraw - before;
      await Bank.withdraw(this.food, need >= 10 ? "Withdraw-10" : need >= 5 ? "Withdraw-5" : "Withdraw-1");
      if (!await Execution.delayUntil(() => this.foodCount() > before, 2500)) {
        break;
      }
    }
  }
  async bankRoutine() {
    this.status = "banking";
    if (!await Traversal.walkResilient(this.bankTile, { radius: 3, attempts: 6, timeoutMs: 300000, log: (m) => this.log(`  ${m}`) })) {
      return;
    }
    if (!await Bank.openNearest("Bank booth", "Use-quickly", (m) => this.log(`  ${m}`))) {
      return;
    }
    await Bank.depositAllMatching(depositAllExcept(this.keepNames()), (m) => this.log(`  ${m}`));
    await this.withdrawFood();
    this.bankEmpty = this.foodCount() === 0;
    if (this.shield !== "" && !Equipment.contains(this.shield) && Inventory.first(this.shield) === null) {
      await this.withdrawTo(this.shield, 1);
      await Equipment.equip(this.shield);
    }
    if (this.weapon !== "" && !Equipment.contains(this.weapon) && Inventory.first(this.weapon) === null) {
      await this.withdrawTo(this.weapon, 1);
      await Equipment.equip(this.weapon);
    }
    if (this.teleEscape) {
      for (const { rune, count } of VARROCK_TELE_RUNES) {
        const target = count * TELE_STOCK;
        if (Inventory.count(rune) < target) {
          await this.withdrawTo(rune, target);
        }
      }
    }
    if (this.hpFrac() < 1 && this.foodCount() > 0) {
      if (Bank.isOpen()) {
        await Bank.close().catch(() => {
          return;
        });
      }
      while (this.hpFrac() < 1 && this.foodCount() > 0) {
        if (!await this.eatOnce()) {
          break;
        }
      }
      if (this.foodCount() < this.foodWithdraw && await Bank.openNearest("Bank booth", "Use-quickly")) {
        await this.withdrawFood();
      }
    }
    this.bankTrips++;
    this.status = "walking to Red Dragon Isle";
    await Traversal.walkResilient(this.anchor, { radius: 4, attempts: 6, timeoutMs: 300000, log: (m) => this.log(`  ${m}`) });
  }
  async returnToField() {
    this.status = "returning to the isle";
    await Traversal.walkResilient(this.anchor, { radius: 4, attempts: 6, timeoutMs: 300000, log: (m) => this.log(`  ${m}`) });
  }
  async fight() {
    this.status = "fighting red dragons";
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      if (this.died || ChatDialog.canContinue() || this.underAttack()) {
        return;
      }
      if (this.foodCount() === 0 && !this.bankEmpty) {
        return;
      }
      if (this.needEat()) {
        await this.eatOnce();
        continue;
      }
      if (this.hpFrac() < this.panicHp) {
        return;
      }
      const dragons = this.fieldDragons();
      if (this.targetIdx !== null && !dragons.some((d) => d.index === this.targetIdx)) {
        this.kills++;
        this.log(`red dragon down — ${this.kills} kills`);
        this.targetIdx = null;
      }
      if (this.findLoot() !== null) {
        if (Inventory.isFull()) {
          await this.freeSlot();
        }
        if (!Inventory.isFull()) {
          await this.lootOnce();
          continue;
        }
      }
      if (this.buryBones && Inventory.contains(BONE_NAME) && Game.inCombat()) {
        await this.buryOnce();
      }
      if (Game.inCombat()) {
        await Execution.delayTicks(2);
        continue;
      }
      const dragon = dragons.sort((a, b) => a.distance() - b.distance())[0];
      if (!dragon) {
        return;
      }
      if (this.style === "mage") {
        await Game.castOnNpc(this.spell, dragon);
      } else {
        await dragon.interact("Attack");
      }
      this.targetIdx = dragon.index;
      await Execution.delayUntil(() => Game.inCombat() || this.fieldDragons().length === 0, 4000);
    }
  }
  onPaint(ctx) {
    const mins = (Date.now() - this.startedAt) / 60000;
    const kph = mins > 0.5 ? Math.round(this.kills / mins * 60) : 0;
    const hides = this.lootCounts.get(HIDE_NAME) ?? 0;
    const hp = Math.round(this.hpFrac() * 100);
    const shieldOn = Equipment.contains(this.shield);
    const lines = [
      `RedDragon  ${this.status}`,
      `${Math.floor(mins)}m  K ${this.kills}  ${mins > 0.5 ? kph : "—"}k/h  HP ${hp}%`,
      `${this.food} ${this.foodCount()}  hide ${hides}  bank ${this.bankTrips}  shield ${shieldOn ? "on" : "OFF"}`
    ];
    const pad = 7;
    const x = GAME_VIEW.x + GAME_VIEW.w - PAINT_W - 4;
    const y = GAME_VIEW.y + GAME_VIEW.h - PAINT_H - 4;
    ctx.fillStyle = "rgba(28, 8, 6, 0.92)";
    ctx.fillRect(x, y, PAINT_W, PAINT_H);
    ctx.strokeStyle = "rgba(232, 86, 42, 0.9)";
    ctx.strokeRect(x + 0.5, y + 0.5, PAINT_W - 1, PAINT_H - 1);
    ctx.fillStyle = "rgba(78, 16, 8, 0.96)";
    ctx.fillRect(x, y, PAINT_W, 20);
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#ff6a3d";
    ctx.fillText(lines[0].slice(0, 34), x + pad, y + 14);
    ctx.font = "12px monospace";
    ctx.fillStyle = "#f4d6c6";
    ctx.fillText(lines[1], x + pad, y + 40);
    ctx.fillText(lines[2], x + pad, y + 56);
    ctx.fillStyle = "rgba(40, 12, 10, 0.95)";
    ctx.fillRect(x + pad, y + 68, PAINT_W - pad * 2, 10);
    ctx.fillStyle = shieldOn ? "#e07040" : "#a03020";
    ctx.fillRect(x + pad, y + 68, Math.max(2, (PAINT_W - pad * 2) * this.hpFrac()), 10);
  }
}
var RedDragon_default = defineBot({
  name: SCRIPT_NAME,
  version: "1.0.0",
  description: "Wilderness Red Dragon Isle: Edgeville bank, anti-dragon shield, bones + hides, PK flee / Varrock tele",
  category: "Combat",
  tags: ["wilderness", "dragons", "hides", "red dragon isle"],
  settingsSchema: SETTINGS,
  create: () => new RedDragon
});
export {
  RedDragon_default as default
};
