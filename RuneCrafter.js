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

// loadable/RuneCrafter.ts
var SCRIPT_NAME = "Benzyme's Runecrafter";
var OPTION_BEST = "Best";
var CRAFT_RECIPES = [
  { label: "Law runes", rune: "Law rune", talisman: "Law talisman", level: 54, ruins: new Tile(2858, 3378, 0), bank: "Draynor", travel: "entrana" },
  { label: "Chaos runes", rune: "Chaos rune", talisman: "Chaos talisman", level: 35, ruins: new Tile(3060, 3585, 0), altar: new Tile(2270, 4841, 0), bank: "Edgeville", travel: "wildy" },
  { label: "Cosmic runes", rune: "Cosmic rune", talisman: "Cosmic talisman", level: 27, ruins: new Tile(3173, 9501, 0), bank: "Zanaris", travel: "zanaris" },
  { label: "Body runes", rune: "Body rune", talisman: "Body talisman", level: 20, ruins: new Tile(3050, 3442, 0), bank: "Edgeville", travel: "walk" },
  { label: "Fire runes", rune: "Fire rune", talisman: "Fire talisman", level: 14, ruins: new Tile(3310, 3252, 0), bank: "Duel Arena", travel: "walk" },
  { label: "Earth runes", rune: "Earth rune", talisman: "Earth talisman", level: 9, ruins: new Tile(3303, 3477, 0), bank: "Varrock East", travel: "walk" },
  { label: "Water runes", rune: "Water rune", talisman: "Water talisman", level: 5, ruins: new Tile(3182, 3162, 0), bank: "Draynor", travel: "walk" },
  { label: "Mind runes", rune: "Mind rune", talisman: "Mind talisman", level: 2, ruins: new Tile(2980, 3511, 0), bank: "Edgeville", travel: "walk" },
  { label: "Air runes", rune: "Air rune", talisman: "Air talisman", level: 1, ruins: new Tile(2983, 3288, 0), bank: "Falador East", travel: "walk" }
];
function chaosPath(level, pts) {
  return pts.map(([x, z]) => new Tile(x, z, level));
}
var CHAOS_DOWN = [
  {
    level: 3,
    dest: new Tile(2255, 4830, 3),
    op: "Climb-down",
    path: chaosPath(3, [
      [2275, 4847],
      [2274, 4847],
      [2274, 4852],
      [2273, 4852],
      [2273, 4854],
      [2272, 4854],
      [2272, 4855],
      [2266, 4855],
      [2266, 4858],
      [2265, 4858],
      [2265, 4859],
      [2260, 4859],
      [2260, 4858],
      [2255, 4858],
      [2255, 4848],
      [2256, 4848],
      [2256, 4847],
      [2260, 4847],
      [2260, 4842],
      [2259, 4842],
      [2259, 4841],
      [2254, 4841],
      [2254, 4831],
      [2255, 4831],
      [2255, 4830]
    ])
  },
  {
    level: 2,
    dest: new Tile(2275, 4835, 2),
    op: "Climb-down",
    path: chaosPath(2, [
      [2255, 4829],
      [2260, 4829],
      [2260, 4828],
      [2265, 4828],
      [2265, 4830],
      [2266, 4830],
      [2266, 4833],
      [2267, 4833],
      [2267, 4838],
      [2266, 4838],
      [2266, 4839],
      [2264, 4839],
      [2264, 4841],
      [2263, 4841],
      [2263, 4842],
      [2259, 4842],
      [2259, 4848],
      [2260, 4848],
      [2260, 4852],
      [2267, 4852],
      [2267, 4848],
      [2268, 4848],
      [2268, 4847],
      [2271, 4847],
      [2271, 4845],
      [2272, 4845],
      [2272, 4844],
      [2275, 4844],
      [2275, 4841],
      [2274, 4841],
      [2274, 4840],
      [2271, 4840],
      [2271, 4835],
      [2275, 4835]
    ])
  },
  {
    level: 1,
    dest: new Tile(2259, 4846, 1),
    op: "Climb-down",
    path: chaosPath(1, [
      [2275, 4834],
      [2280, 4834],
      [2280, 4831],
      [2279, 4831],
      [2279, 4827],
      [2265, 4827],
      [2265, 4826],
      [2262, 4826],
      [2262, 4825],
      [2258, 4825],
      [2258, 4829],
      [2259, 4829],
      [2259, 4833],
      [2262, 4833],
      [2262, 4837],
      [2261, 4837],
      [2261, 4838],
      [2256, 4838],
      [2256, 4841],
      [2255, 4841],
      [2255, 4842],
      [2253, 4842],
      [2253, 4845],
      [2258, 4845],
      [2258, 4846],
      [2259, 4846]
    ])
  },
  {
    level: 0,
    dest: new Tile(2268, 4841, 0),
    path: chaosPath(0, [
      [2259, 4846],
      [2260, 4846],
      [2264, 4842],
      [2266, 4842],
      [2267, 4841],
      [2268, 4841]
    ])
  }
];
var CHAOS_PORTAL = new Tile(2281, 4837, 0);
var CHAOS_PORTAL_PATH = chaosPath(0, [
  [2268, 4841],
  [2274, 4841],
  [2274, 4840],
  [2277, 4840],
  [2277, 4838],
  [2278, 4838],
  [2278, 4837],
  [2281, 4837]
]);
function nextChaosHop(tile) {
  if (tile === null) {
    return null;
  }
  return CHAOS_DOWN.find((hop) => hop.level === tile.level) ?? null;
}
var RUNE_CHOICES = [OPTION_BEST, ...[...CRAFT_RECIPES].reverse().map((r) => r.label)];
var BY_LABEL = new Map(CRAFT_RECIPES.map((r) => [r.label, r]));
var SHED_OUTSIDE = new Tile(3201, 3169, 0);
var ZANARIS_SPAWN = new Tile(3220, 9592, 0);
var SHED_SOUTH = new Tile(3220, 9576, 0);
var ZANARIS_BANK = new Tile(3153, 9576, 0);
var ZANARIS_DOOR_ID = 2406;
var ZANARIS_PLACEHOLDER_LADDER_ID = 2410;
var DRAMEN_STAFF = "Dramen staff";
var LOST_CITY_QUEST = "Lost City";
var ESSENCE = "Rune essence";
var ESSENCE_ID = 1436;
var RUINS = "Mysterious ruins";
var ALTAR = { name: "Altar", op: "Craft-rune" };
var PORTAL = { name: "Portal", op: "Use" };
var MAX_BANK_FAILS = 6;
var MAX_ENTER_FAILS = 3;
var TRADE_LOAD = 26;
var TRADEREQ_CHAT = 4;
var TRADE_REQ_TEXT = /wishes to trade with you/i;
var EMPTY_TRADE_MS = 20000;
var ADJACENT = 2;
var TEMPLE_RANGE = 30;
var ALTAR_PARK = 2;
var MODES = ["Solo", "Runner", "Mule Recipient"];
var ENTRANA_GEAR = /\b(sword|dagger|scimitar|longsword|2h|two.handed|mace|warhammer|battleaxe|axe|pickaxe|spear|hasta|halberd|maul|claws|whip|bow|crossbow|javelin|dart|thrownaxe|knife|staff|wand|battlestaff|cannon|helmet|full helm|med helm|coif|platebody|chainbody|platelegs|plateskirt|kiteshield|square shield|sq shield|dragon square|god cape|fire cape|obsidian cape|defender)\b/i;
var FALLBACK_BANKS = {
  "Varrock East": new Tile(3253, 3420, 0),
  Draynor: new Tile(3093, 3243, 0),
  "Falador East": new Tile(3013, 3355, 0),
  Edgeville: new Tile(3094, 3493, 0),
  "Duel Arena": new Tile(3382, 3269, 0),
  Zanaris: ZANARIS_BANK
};
var SETTINGS = {
  rune: {
    type: "string",
    default: OPTION_BEST,
    options: [...RUNE_CHOICES],
    label: "Rune",
    help: "Best uses the highest altar your Runecrafting level and talismans allow. " + "Cosmic needs Lost City complete and a wielded Dramen staff at the swamp shed. Nature is NatureCrafter."
  },
  mode: {
    type: "string",
    default: "Solo",
    options: MODES,
    label: "Mode",
    help: "Solo banks its own essence. Runner ferries a 26-essence load into the altar. Mule Recipient camps at the altar."
  },
  partner: {
    type: "string",
    default: "",
    label: "Trade essence to (IGN)",
    help: "the Mule Recipient this runner delivers essence to",
    showIf: { key: "mode", anyOf: ["Runner"] }
  },
  skipChaos: {
    type: "boolean",
    default: false,
    label: "Best: Skip Chaos Runes",
    help: "When Rune is Best, never pick Chaos even if you have the level and a Chaos talisman. Explicit Chaos runes still crafts them.",
    showIf: { key: "rune", anyOf: [OPTION_BEST] }
  }
};
function recipeByLabel(label) {
  return BY_LABEL.get(label) ?? null;
}
function pickBestRecipe(level, hasAccess) {
  for (const recipe of CRAFT_RECIPES) {
    if (level >= recipe.level && hasAccess(recipe)) {
      return recipe;
    }
  }
  return null;
}
function namesHaveTalisman(names, recipe) {
  const want = recipe.talisman.toLowerCase();
  for (const name of names) {
    if (name.toLowerCase() === want) {
      return true;
    }
  }
  return false;
}
function recipeUnlocked(recipe, opts) {
  if (opts.level < recipe.level) {
    return false;
  }
  if (opts.skipChaos && recipe.label === "Chaos runes") {
    return false;
  }
  if (recipe.travel === "zanaris" && !opts.lostCity) {
    return false;
  }
  return true;
}
function inAltarInterior(tile) {
  return tile !== null && tile.z >= 4600 && tile.z < 5000;
}
function inZanaris(tile) {
  return tile !== null && tile.level === 0 && tile.x >= 3150 && tile.x <= 3300 && tile.z >= 9450 && tile.z <= 9700;
}
function keepNames(recipe, extra = []) {
  const keep = [recipe.talisman, ...extra];
  if (recipe.travel === "zanaris") {
    keep.push(DRAMEN_STAFF);
  }
  return keep;
}
function paintRuneLabel(choice, recipe) {
  if (choice === OPTION_BEST) {
    return recipe ? `${OPTION_BEST} → ${recipe.label}` : OPTION_BEST;
  }
  return recipe?.label ?? choice;
}
function bankTileNamed(name) {
  const known = BANK_LOCATIONS.find((b) => b.name === name);
  if (known) {
    return new Tile(known.tile.x, known.tile.z, known.tile.level);
  }
  const fallback = FALLBACK_BANKS[name];
  if (!fallback) {
    throw new Error(`RuneCrafter: unknown bank '${name}'`);
  }
  return fallback;
}
function nearestBanks(from) {
  return BANK_LOCATIONS.map((b) => ({ name: b.name, tile: new Tile(b.tile.x, b.tile.z, b.tile.level), d: bankDistance(from, b.tile) })).sort((a, b) => a.d - b.d);
}
function inTemple() {
  return inAltarInterior(Game.tile());
}
function heldNames() {
  return [
    ...Inventory.items().map((i) => i.name ?? ""),
    ...Equipment.items().map((i) => i.name ?? "")
  ].filter(Boolean);
}
function bankNames() {
  return Bank.items().map((i) => i.name ?? "").filter(Boolean);
}
function lostCityBlocked() {
  const status = Quests.status(LOST_CITY_QUEST);
  return (status === "notStarted" || status === "inProgress") && !inZanaris(Game.tile());
}
function canAttemptZanaris() {
  return !lostCityBlocked();
}
function essCount() {
  return Inventory.items().filter((i) => i.id === ESSENCE_ID).reduce((s, i) => s + i.count, 0);
}
function packJunk(keep) {
  const kept = new Set(keep.map((s) => s.toLowerCase()));
  return Inventory.items().filter((i) => !kept.has((i.name ?? "").toLowerCase()));
}
function sameName(a, b) {
  const clean = (s) => s.toLowerCase().replace(/[\u00A0_]/g, " ").trim();
  return clean(a) === clean(b);
}
function playerNamed(name, range) {
  return Players.query().where((p) => p.name !== null && sameName(p.name, name)).within(range).nearest();
}
function hasEntranaRestrictedGear() {
  return [...Inventory.items(), ...Equipment.items()].some((i) => ENTRANA_GEAR.test(i.name ?? ""));
}
function fmtDuration(mins) {
  const total = Math.max(0, Math.floor(mins * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtCount(n) {
  return Math.round(n).toLocaleString("en-US");
}
function paintHud(ctx, lines) {
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "top";
  const padX = 4;
  const padY = 3;
  const lineH = 14;
  const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const w = Math.ceil(textW) + padX * 2;
  const h = padY * 2 + lines.length * lineH;
  const x = 4 + 512 - w - 4;
  const y = 4 + 334 - h - 4;
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3c3c3c";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? "#800000" : "#ffffff";
    ctx.fillText(line, x + padX, y + padY + i * lineH);
  });
  ctx.restore();
}
function stopBot(bot, reason) {
  bot.log(reason);
  const host = globalThis.rs2b0t;
  host?.runner?.stop?.(reason);
}
function shedDoor(within, near = null) {
  const byId = Locs.query().where((l) => l.id === ZANARIS_DOOR_ID).action("Open").within(within).nearest();
  if (byId) {
    return byId;
  }
  return Locs.query().name("Door").action("Open").where((l) => l.id !== ZANARIS_PLACEHOLDER_LADDER_ID && (!near || l.tile().distanceTo(near) <= within)).within(within).nearest();
}
function altarLoc() {
  return Locs.query().name(ALTAR.name).action(ALTAR.op).nearest();
}
function portalLoc() {
  return Locs.query().name(PORTAL.name).action(PORTAL.op).nearest();
}
async function climbTowardAltar(bot) {
  const here = Game.tile();
  const level = here?.level ?? 0;
  const down = Locs.query().name("Ladder").action("Climb-down").within(3).nearest();
  if (!down) {
    return;
  }
  bot.setStatus("climbing down the maze");
  bot.log("climbing down toward the altar");
  await down.interact("Climb-down");
  await Execution.delayUntil(() => (Game.tile()?.level ?? level) < level, 8000);
}
async function clickWalk(dest, radius, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastClick = 0;
  let stuck = 0;
  let last = Game.tile();
  while (Date.now() < deadline) {
    const here = Game.tile();
    if (here && dest.distanceTo(here) <= radius) {
      return true;
    }
    if (Date.now() - lastClick > 1800) {
      await DirectNavigator.walk(dest);
      lastClick = Date.now();
      if (last && here && last.x === here.x && last.z === here.z && last.level === here.level) {
        stuck++;
      } else {
        stuck = 0;
      }
      last = here;
      if (stuck >= 4) {
        return dest.distanceTo(Game.tile() ?? dest) <= radius;
      }
    }
    await Execution.delayTicks(2);
  }
  return dest.distanceTo(Game.tile() ?? dest) <= radius;
}
async function walkWaypoints(path, dest, radius) {
  const here = Game.tile();
  if (here && dest.distanceTo(here) <= radius) {
    return true;
  }
  let start = 0;
  if (here) {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0;i < path.length; i++) {
      const step = path[i];
      if (!step) {
        continue;
      }
      const d = step.distanceTo(here);
      if (d < best) {
        best = d;
        start = i;
      }
    }
  }
  for (let i = start;i < path.length; i++) {
    const step = path[i];
    if (!step) {
      continue;
    }
    const last = i === path.length - 1;
    if (!await clickWalk(step, last ? radius : 1, last ? 25000 : 12000)) {
      return dest.distanceTo(Game.tile() ?? dest) <= radius;
    }
  }
  return dest.distanceTo(Game.tile() ?? dest) <= radius;
}
async function sceneWalkTo(dest, radius) {
  const here = Game.tile();
  const hop = nextChaosHop(here);
  if (hop && dest.distanceTo(hop.dest) <= 2) {
    return walkWaypoints(hop.path, dest, radius);
  }
  if (dest.distanceTo(CHAOS_PORTAL) <= 2) {
    return walkWaypoints(CHAOS_PORTAL_PATH, dest, radius);
  }
  return clickWalk(dest, radius, 45000);
}
async function followChaosMaze(bot) {
  for (let guard = 0;guard < 8; guard++) {
    const here = Game.tile();
    const hop = nextChaosHop(here);
    if (!hop || !here) {
      return;
    }
    if (hop.dest.distanceTo(here) <= 2 && !hop.op) {
      return;
    }
    const floor = 4 - hop.level;
    bot.setStatus(`chaos maze floor ${floor}`);
    const nearLadder = hop.op ? Locs.query().name("Ladder").action(hop.op).within(3).nearest() : null;
    if (!nearLadder) {
      bot.log(`chaos maze floor ${floor}: walking to ${hop.dest.x},${hop.dest.z}`);
      await bot.walkTo(hop.dest, 2);
    }
    if (!hop.op) {
      return;
    }
    const ladder = nearLadder ?? Locs.query().name("Ladder").action(hop.op).within(5).nearest();
    if (!ladder) {
      await climbTowardAltar(bot);
      continue;
    }
    bot.log(`${hop.op} the maze ladder`);
    const level = Game.tile()?.level ?? hop.level;
    await ladder.interact(hop.op);
    if (!await Execution.delayUntil(() => (Game.tile()?.level ?? level) < level, 8000)) {
      await climbTowardAltar(bot);
    }
  }
}
async function approachAltar(bot) {
  const close = altarLoc();
  if (close && close.distance() <= 2) {
    return close;
  }
  if (bot.altarTile()) {
    await followChaosMaze(bot);
  }
  let found = altarLoc();
  if (!found) {
    await climbTowardAltar(bot);
    found = altarLoc();
  }
  if (found && found.distance() > 2) {
    await bot.walkTo(found.tile(), 1);
    found = altarLoc();
  }
  return found;
}
function runnerLoaded(bot) {
  const talisman = bot.talismanName();
  if (!talisman) {
    return false;
  }
  return Inventory.contains(talisman) && essCount() === TRADE_LOAD && packJunk(bot.keepPack([ESSENCE])).length === 0;
}
async function openBank(bot) {
  const log = (m) => bot.log(`  ${m}`);
  await bot.walkTo(bot.bankTile(), 3);
  if (await Banking.open({ stand: bot.bankTile(), log })) {
    bot.resetBankFail();
    return true;
  }
  if (inZanaris(Game.tile())) {
    const banker = Npcs.query().name("Banker").action("Bank").within(16).nearest();
    if (banker) {
      log("Bank fairy banker");
      await banker.interact("Bank");
      await Execution.delayUntil(() => Bank.isOpen() || ChatDialog.isOpen() || ChatDialog.canContinue(), 6000);
      if (ChatDialog.canContinue()) {
        await ChatDialog.continue();
      }
      if (ChatDialog.isOpen() && ChatDialog.options().length > 0) {
        await ChatDialog.chooseOption("bank");
      }
      if (await Execution.delayUntil(() => Bank.isOpen(), 4000)) {
        bot.resetBankFail();
        return true;
      }
    }
  }
  if (bot.bankName() === "Duel Arena") {
    if (await Bank.openNearestAccess({
      name: "Open chest",
      op: "Bank",
      openFirst: { name: "Closed chest", op: "Open" }
    }, log)) {
      bot.resetBankFail();
      return true;
    }
  }
  if (bot.countBankFail() >= MAX_BANK_FAILS) {
    stopBot(bot, "RuneCrafter: couldn't reach the bank — start nearer it");
    return false;
  }
  bot.log("could not open the bank — will retry");
  return false;
}
async function cleanPack(bot, keep) {
  const kept = new Set(keep.map((s) => s.toLowerCase()));
  const deposit = () => Bank.depositAllMatching((name) => !kept.has(name.toLowerCase()), (m) => bot.log(`  ${m}`));
  await Bank.setNoteMode(false);
  await deposit();
  await Execution.delayTicks(1);
  if (packJunk(keep).length > 0) {
    await deposit();
    await Execution.delayUntil(() => packJunk(keep).length === 0, 2500);
  }
  const left = packJunk(keep);
  if (left.length > 0) {
    stopBot(bot, `RuneCrafter: ${left.length} item(s) would not deposit (${left.map((i) => `${i.name ?? "unnamed"}#${i.id}`).join(", ")})`);
    return false;
  }
  return true;
}
async function ensureNamed(bot, name, need) {
  if (Inventory.contains(name) || Equipment.contains(name)) {
    return true;
  }
  await Execution.delayUntil(() => Bank.loaded(), 3000);
  const item = Bank.items().find((i) => i.name?.toLowerCase() === name.toLowerCase());
  if (!item) {
    stopBot(bot, `RuneCrafter: no ${name} in the bank or pack (${need})`);
    return false;
  }
  const op = withdrawOp(item.ops, "1") ?? withdrawOp(item.ops, "any") ?? "Withdraw-1";
  await Bank.withdraw(name, op);
  if (!await Execution.delayUntil(() => Inventory.contains(name) || Equipment.contains(name), 3000)) {
    stopBot(bot, `RuneCrafter: the ${name} withdraw never landed`);
    return false;
  }
  bot.log(`withdrew a ${name}`);
  return true;
}
async function ensureTalisman(bot) {
  const talisman = bot.talismanName();
  if (!talisman) {
    return false;
  }
  return ensureNamed(bot, talisman, "the altar can't be entered without one");
}
async function ensureDramen(bot) {
  if (bot.recipe()?.travel !== "zanaris") {
    return true;
  }
  return ensureNamed(bot, DRAMEN_STAFF, "the swamp shed only teleports while it is wielded");
}
async function stripEntranaGear(bot) {
  if (bot.recipe()?.travel !== "entrana" || !hasEntranaRestrictedGear()) {
    return true;
  }
  bot.log("removing weapons and armour before Entrana");
  for (const item of Equipment.items()) {
    if (item.name && !await Equipment.unequip(item.name)) {
      stopBot(bot, `RuneCrafter: could not remove ${item.name} — Entrana monks refuse weapons and armour`);
      return false;
    }
  }
  return true;
}

class RuneCrafter extends TaskBot {
  loopDelay = 600;
  recipeState = null;
  choice = OPTION_BEST;
  skipChaos = false;
  mode = "Solo";
  partner = "";
  lastRequester = null;
  trips = 0;
  crafted = 0;
  trades = 0;
  moved = 0;
  bankFails = 0;
  status = "starting";
  startedAt = Date.now();
  xpAtStart = 0;
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    this.choice = this.settings.str("rune", OPTION_BEST);
    this.skipChaos = this.settings.bool("skipChaos", false);
    this.mode = this.settings.str("mode", "Solo");
    this.partner = this.settings.str("partner", "").trim();
    this.startedAt = Date.now();
    this.xpAtStart = Skills.xp("runecraft");
    if (this.choice === OPTION_BEST) {
      this.recipeState = this.pickFromNames(heldNames());
    } else {
      const recipe = recipeByLabel(this.choice);
      if (!recipe) {
        throw new Error(`RuneCrafter: unknown rune '${this.choice}'`);
      }
      this.recipeState = recipe;
    }
    if (this.recipeState && Skills.level("runecraft") < this.recipeState.level) {
      throw new Error(`RuneCrafter: Runecrafting ${this.recipeState.level} required for ${this.recipeState.label}`);
    }
    if (this.recipeState?.travel === "zanaris" && lostCityBlocked()) {
      throw new Error("RuneCrafter: Cosmic runes need Lost City complete, then a wielded Dramen staff at the Lumbridge swamp shed");
    }
    const continueDialog = {
      validate: () => ChatDialog.canContinue(),
      execute: async () => {
        await ChatDialog.continue();
      }
    };
    if (this.mode === "Runner") {
      if (!this.partner) {
        throw new Error("RuneCrafter: no trade partner configured");
      }
      this.log(`RuneCrafter runner starting — ${this.paintRune()} for '${this.partner}'`);
      this.add(continueDialog, new RunnerTrade(this), new RunnerDeliver(this), new Exit(this), new RunnerRestock(this), new Enter(this, () => essCount() > 0));
      return;
    }
    if (this.mode === "Mule Recipient") {
      this.on("chat.message", (e) => {
        if (e.type === TRADEREQ_CHAT && e.username && TRADE_REQ_TEXT.test(e.text)) {
          this.lastRequester = e.username;
        }
      });
      this.log(`RuneCrafter mule recipient starting — ${this.paintRune()}`);
      this.add(continueDialog, new MuleTakeTrade(this), new Craft(this, false), new MuleDropJunk(this), new MuleAnswerRequest(this), new MuleWait(this), new MulePrepare(this), new Enter(this, () => true));
      return;
    }
    this.log(`RuneCrafter starting — ${this.paintRune()}, bank ${this.bankName()}`);
    this.add(continueDialog, new Craft(this, true), new Exit(this), new BankTrip(this), new Enter(this, () => essCount() > 0));
  }
  onPaint(ctx) {
    const mins = (Date.now() - this.startedAt) / 60000;
    const hrs = mins / 60;
    const xp = Math.max(0, Skills.xp("runecraft") - this.xpAtStart);
    const xph = hrs > 0.008 ? xp / hrs : 0;
    const stats = this.mode === "Runner" ? `delivered ${this.moved} - trades ${this.trades} - pack ${Inventory.used()}/28` : `${this.mode.toLowerCase()} ${this.crafted} - trips ${this.trips} - pack ${Inventory.used()}/28`;
    paintHud(ctx, [
      SCRIPT_NAME,
      `time ${fmtDuration(mins)} - ${this.status}`,
      `${this.paintRune()} - RC ${Skills.level("runecraft")}`,
      stats,
      `xp +${fmtCount(xp)}${xph > 0 ? ` (${fmtCount(xph)}/h)` : ""}`
    ]);
  }
  pickFromNames(names) {
    const level = Skills.level("runecraft");
    const lostCity = canAttemptZanaris();
    return pickBestRecipe(level, (recipe) => recipeUnlocked(recipe, { level, lostCity, skipChaos: this.skipChaos }) && namesHaveTalisman(names, recipe));
  }
  resolveAtBank() {
    if (this.choice !== OPTION_BEST) {
      const recipe = recipeByLabel(this.choice) ?? this.recipeState;
      if (!recipe) {
        stopBot(this, `RuneCrafter: unknown rune '${this.choice}'`);
        return false;
      }
      this.recipeState = recipe;
      return true;
    }
    const picked = this.pickFromNames([...heldNames(), ...bankNames()]);
    if (!picked) {
      stopBot(this, "RuneCrafter: Best found no craftable altar — need a talisman your Runecrafting level can use (Cosmic also needs Lost City)");
      return false;
    }
    if (this.recipeState?.label !== picked.label) {
      this.log(`Best → ${picked.label} (RC ${Skills.level("runecraft")}, ${picked.talisman})`);
    }
    this.recipeState = picked;
    return true;
  }
  atRecipeBank() {
    const here = Game.tile();
    const dest = this.bankTile();
    if (!here) {
      return false;
    }
    if (inZanaris(dest) !== inZanaris(here)) {
      return false;
    }
    return Math.max(Math.abs(here.x - dest.x), Math.abs(here.z - dest.z)) <= 14;
  }
  setStatus(s) {
    this.status = s;
  }
  countCraft(n) {
    this.crafted += n;
  }
  countTrip() {
    this.trips++;
  }
  tripsTotal() {
    return this.trips;
  }
  countTrade(essence) {
    this.trades++;
    this.moved += essence;
  }
  countBankFail() {
    return ++this.bankFails;
  }
  resetBankFail() {
    this.bankFails = 0;
  }
  recipe() {
    return this.recipeState;
  }
  paintRune() {
    return paintRuneLabel(this.choice, this.recipeState);
  }
  talismanName() {
    return this.recipeState?.talisman ?? "";
  }
  runeName() {
    return this.recipeState?.rune ?? "";
  }
  ruinsTile() {
    return this.recipeState?.ruins ?? SHED_OUTSIDE;
  }
  altarTile() {
    return this.recipeState?.altar ?? null;
  }
  bankName() {
    if (this.recipeState) {
      return this.recipeState.bank;
    }
    const here = Game.tile();
    if (here && inZanaris(here)) {
      return "Zanaris";
    }
    return nearestBank(here ?? { x: 3093, z: 3243, level: 0 })?.name ?? "Draynor";
  }
  bankTile() {
    return bankTileNamed(this.bankName());
  }
  keepPack(extra = []) {
    if (this.recipeState) {
      return keepNames(this.recipeState, extra);
    }
    return [DRAMEN_STAFF, ...extra];
  }
  partnerName() {
    return this.partner;
  }
  pendingRequester() {
    return this.lastRequester;
  }
  takeRequester() {
    const name = this.lastRequester;
    this.lastRequester = null;
    return name;
  }
  muleKeep() {
    return this.keepPack(this.recipeState ? [this.recipeState.rune] : []);
  }
  async walkTo(dest, radius = 2) {
    const here = Game.tile();
    if (here && new Tile(here.x, here.z, here.level).distanceTo(dest) <= radius) {
      return;
    }
    if (inAltarInterior(here)) {
      if (await sceneWalkTo(dest, radius)) {
        return;
      }
      this.log(`scene walk did not reach ${dest.x},${dest.z} in the temple`);
      return;
    }
    const wantZanaris = inZanaris(dest);
    const hereZanaris = inZanaris(here);
    if (wantZanaris && !hereZanaris) {
      if (!await this.enterZanaris()) {
        return;
      }
    } else if (!wantZanaris && hereZanaris) {
      if (!await this.leaveZanaris()) {
        return;
      }
    }
    const now = Game.tile();
    if (now && new Tile(now.x, now.z, now.level).distanceTo(dest) <= radius) {
      return;
    }
    if (inZanaris(now) && now && new Tile(now.x, now.z, now.level).distanceTo(ZANARIS_SPAWN) <= 20 && dest.distanceTo(ZANARIS_SPAWN) > 20) {
      if (new Tile(now.x, now.z, now.level).distanceTo(SHED_SOUTH) > 3) {
        this.log("walking south of the Zanaris shed, then on to the fairy bank");
        await Traversal.walkResilient(SHED_SOUTH, { radius: 3, attempts: 3, timeoutMs: 60000, log: (m) => this.log(`  ${m}`) });
      }
    }
    await Traversal.walkResilient(dest, { radius, attempts: 6, timeoutMs: 240000, log: (m) => this.log(`  ${m}`) });
  }
  async enterZanaris() {
    if (inZanaris(Game.tile()) || inAltarInterior(Game.tile())) {
      return true;
    }
    if (lostCityBlocked()) {
      stopBot(this, "RuneCrafter: Cosmic runes need Lost City complete to enter Zanaris through the swamp shed");
      return false;
    }
    if (!Equipment.contains(DRAMEN_STAFF) && !Inventory.contains(DRAMEN_STAFF)) {
      const here2 = Game.tile();
      const bank = (here2 ? nearestBanks(here2) : []).find((b) => b.name !== "Zanaris");
      if (!bank) {
        stopBot(this, "RuneCrafter: wield a Dramen staff before opening the Lumbridge swamp shed (Lost City)");
        return false;
      }
      this.setStatus("banking Dramen staff");
      this.log(`Dramen staff not in pack — withdrawing at ${bank.name} before the swamp shed`);
      if (!await Banking.open({ stand: bank.tile, log: (m) => this.log(`  ${m}`) })) {
        return false;
      }
      if (!await ensureNamed(this, DRAMEN_STAFF, "Lost City's swamp shed only teleports while it is wielded")) {
        return false;
      }
      await Bank.close();
    }
    if (!Equipment.contains(DRAMEN_STAFF)) {
      this.setStatus("wielding Dramen staff");
      this.log("wielding Dramen staff for the Zanaris shed");
      await Equipment.equip(DRAMEN_STAFF);
    }
    if (!Equipment.contains(DRAMEN_STAFF)) {
      stopBot(this, "RuneCrafter: wield a Dramen staff before opening the Lumbridge swamp shed (Lost City)");
      return false;
    }
    const here = Game.tile();
    if (here && new Tile(here.x, here.z, here.level).distanceTo(SHED_OUTSIDE) > 2) {
      this.setStatus("walking to Lost City shed");
      this.log(`not in Zanaris (at ${here.x},${here.z}), walking to the Lumbridge swamp shed`);
      if (!await Traversal.walkResilient(SHED_OUTSIDE, { radius: 1, attempts: 4, timeoutMs: 300000, log: (m) => this.log(`  ${m}`) })) {
        return false;
      }
    }
    const door = shedDoor(6, SHED_OUTSIDE);
    if (!door) {
      this.log("no Lost City shed Door to Open");
      return false;
    }
    this.setStatus("entering Zanaris shed");
    this.log("Open the swamp shed Door (Dramen staff wielded)");
    if (!await door.interact("Open")) {
      return false;
    }
    if (await Execution.delayUntil(() => inZanaris(Game.tile()), 15000)) {
      const land = Game.tile();
      this.log(`entered Zanaris from the swamp shed${land ? ` at ${land.x},${land.z}` : ""}`);
      return true;
    }
    return false;
  }
  async leaveZanaris() {
    if (!inZanaris(Game.tile())) {
      return true;
    }
    if (!Equipment.contains(DRAMEN_STAFF) && Inventory.contains(DRAMEN_STAFF)) {
      this.setStatus("wielding Dramen staff");
      await Equipment.equip(DRAMEN_STAFF);
    }
    this.setStatus("leaving Zanaris");
    this.log("leaving Zanaris through the shed Door");
    if (!await Traversal.walkResilient(ZANARIS_SPAWN, { radius: 2, attempts: 4, timeoutMs: 120000, log: (m) => this.log(`  ${m}`) })) {
      return false;
    }
    const door = shedDoor(8, ZANARIS_SPAWN);
    if (!door) {
      this.log("no Zanaris shed Door to Open — standing at the spawn until one is in scene");
      return false;
    }
    if (!await door.interact("Open")) {
      return false;
    }
    return Execution.delayUntil(() => !inZanaris(Game.tile()) && !inAltarInterior(Game.tile()), 15000);
  }
}

class Craft {
  bot;
  thenExit;
  constructor(bot, thenExit) {
    this.bot = bot;
    this.thenExit = thenExit;
  }
  validate() {
    return inTemple() && essCount() > 0;
  }
  async execute() {
    const altar = await approachAltar(this.bot);
    if (!altar) {
      await Execution.delayTicks(2);
      return;
    }
    this.bot.setStatus("crafting runes");
    const before = essCount();
    this.bot.log(`crafting ${before} essence at the altar`);
    if (!await altar.interact(ALTAR.op)) {
      await Execution.delayTicks(2);
      return;
    }
    await Execution.delayUntil(() => essCount() === 0, 8000);
    const made = before - essCount();
    this.bot.countCraft(made);
    this.bot.log(`crafted ${made} ${this.bot.runeName()}s`);
    if (!this.thenExit) {
      return;
    }
    this.bot.setStatus("taking the portal out");
    this.bot.log("taking the portal back to the ruins");
    for (let i = 0;i < 15 && inTemple(); i++) {
      if (ChatDialog.canContinue()) {
        await ChatDialog.continue();
        continue;
      }
      const portal = portalLoc();
      if (portal) {
        await portal.interact(PORTAL.op);
      } else if (this.bot.altarTile()) {
        await approachAltar(this.bot);
      }
      await Execution.delayTicks(1);
    }
    if (!inTemple()) {
      this.bot.log("back at the mysterious ruins");
    }
  }
}

class Exit {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return inTemple() && essCount() === 0;
  }
  async execute() {
    let portal = portalLoc();
    if (!portal && this.bot.altarTile()) {
      const here = Game.tile();
      if (here && here.level === 0) {
        await this.bot.walkTo(CHAOS_PORTAL, 2);
      } else {
        await approachAltar(this.bot);
      }
      portal = portalLoc();
    }
    if (!portal) {
      await Execution.delayTicks(2);
      return;
    }
    this.bot.setStatus("taking the portal out");
    this.bot.log("taking the portal back to the ruins");
    if (!await portal.interact(PORTAL.op)) {
      await Execution.delayTicks(2);
      return;
    }
    if (await Execution.delayUntil(() => !inTemple(), 15000)) {
      this.bot.log("back at the mysterious ruins");
    }
  }
}

class BankTrip {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return !inTemple() && essCount() === 0;
  }
  async execute() {
    this.bot.setStatus("banking");
    this.bot.log("heading to the bank");
    if (!await openBank(this.bot)) {
      return;
    }
    if (!await this.bot.resolveAtBank()) {
      return;
    }
    if (!this.bot.atRecipeBank()) {
      if (!await ensureDramen(this.bot)) {
        return;
      }
      await Bank.close();
      this.bot.log(`moving to the ${this.bot.bankName()} bank for ${this.bot.paintRune()}`);
      return;
    }
    if (!await stripEntranaGear(this.bot)) {
      return;
    }
    const madeRunes = this.bot.runeName() ? Inventory.count(this.bot.runeName()) : 0;
    if (!await cleanPack(this.bot, this.bot.keepPack())) {
      return;
    }
    this.bot.countTrip();
    if (madeRunes > 0) {
      this.bot.log(`deposited ${madeRunes} ${this.bot.runeName()}s`);
    }
    if (!await ensureTalisman(this.bot)) {
      return;
    }
    if (!await ensureDramen(this.bot)) {
      return;
    }
    if (Bank.count(ESSENCE) === 0) {
      stopBot(this.bot, "RuneCrafter: out of Rune essence in the bank");
      return;
    }
    const ess = Bank.items().find((i) => i.name?.toLowerCase() === ESSENCE.toLowerCase());
    const op = (ess && withdrawOp(ess.ops, "all")) ?? "Withdraw-All";
    await Bank.withdraw(ESSENCE, op);
    await Execution.delayUntil(() => essCount() > 0 || Bank.count(ESSENCE) === 0, 4000);
    this.bot.log(`withdrew ${essCount()} rune essence (trip ${this.bot.tripsTotal()})`);
  }
}

class Enter {
  bot;
  ready;
  fails = 0;
  constructor(bot, ready) {
    this.bot = bot;
    this.ready = ready;
  }
  validate() {
    return !inTemple() && this.ready() && this.bot.recipe() !== null;
  }
  async execute() {
    this.bot.setStatus("heading to the ruins");
    this.bot.log("heading to the mysterious ruins");
    await this.bot.walkTo(this.bot.ruinsTile(), 1);
    const ruins = Locs.query().name(RUINS).nearest();
    const talisman = Inventory.first(this.bot.talismanName());
    if (!talisman) {
      stopBot(this.bot, `RuneCrafter: no ${this.bot.talismanName()} in the pack — the altar can't be entered without one`);
      return;
    }
    if (!ruins) {
      await Execution.delayTicks(2);
      return;
    }
    this.bot.setStatus("entering the altar");
    this.bot.log(`using the ${this.bot.talismanName()} on the mysterious ruins`);
    if (!await talisman.useOn(ruins)) {
      await Execution.delayTicks(2);
      return;
    }
    if (await Execution.delayUntil(() => inTemple(), 1e4)) {
      this.bot.log("entered the altar");
      this.fails = 0;
      return;
    }
    if (++this.fails >= MAX_ENTER_FAILS) {
      stopBot(this.bot, "RuneCrafter: the talisman didn't teleport into the altar");
    }
  }
}

class RunnerTrade {
  bot;
  before = 0;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return Trade.active();
  }
  async execute() {
    if (Trade.onConfirmScreen()) {
      this.bot.setStatus("confirming the delivery");
      await Trade.accept();
      if (await Execution.delayUntil(() => !Trade.active(), 3000)) {
        const delivered = this.before - essCount();
        if (delivered > 0) {
          this.bot.countTrade(delivered);
          this.bot.log(`delivered ${delivered} essence to ${this.bot.partnerName()}`);
        }
        this.before = 0;
      }
      return;
    }
    if (Trade.myOffer().length === 0) {
      const held2 = essCount();
      if (held2 <= 0) {
        await Execution.delayTicks(1);
        return;
      }
      this.before = held2;
      this.bot.setStatus("offering essence");
      if (held2 <= TRADE_LOAD) {
        await Trade.offerAll(ESSENCE, (i) => i.id === ESSENCE_ID);
      } else {
        await Trade.offer(ESSENCE, TRADE_LOAD, (i) => i.id === ESSENCE_ID);
      }
    } else {
      this.bot.setStatus("accepting the delivery");
      await Trade.accept();
    }
  }
}

class RunnerDeliver {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return inTemple() && essCount() > 0 && !Trade.active();
  }
  async execute() {
    const partner = this.bot.partnerName();
    const master = playerNamed(partner, TEMPLE_RANGE);
    if (!master) {
      this.bot.setStatus(`looking for ${partner} at the altar`);
      const altar = await approachAltar(this.bot);
      if (altar) {
        await DirectNavigator.walkTo(altar.tile(), ALTAR_PARK + 1, 1e4);
      }
      await Execution.delayTicks(2);
      return;
    }
    this.bot.setStatus(`delivering to ${partner}`);
    this.bot.log(`requesting a trade with ${master.name}`);
    await Trade.request(master.name ?? partner);
    await Execution.delayUntil(() => Trade.active(), 4000);
  }
}

class RunnerRestock {
  bot;
  emptyReads = 0;
  stocked = false;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    if (essCount() === 0) {
      this.stocked = false;
    }
    return !inTemple() && !Trade.active() && !this.stocked && !runnerLoaded(this.bot);
  }
  async execute() {
    this.bot.setStatus("restocking essence");
    if (!await openBank(this.bot)) {
      return;
    }
    if (!await this.bot.resolveAtBank()) {
      return;
    }
    if (!this.bot.atRecipeBank()) {
      if (!await ensureDramen(this.bot)) {
        return;
      }
      await Bank.close();
      return;
    }
    if (!await stripEntranaGear(this.bot)) {
      return;
    }
    if (!await cleanPack(this.bot, this.bot.keepPack())) {
      return;
    }
    if (!await ensureTalisman(this.bot)) {
      return;
    }
    if (!await ensureDramen(this.bot)) {
      return;
    }
    await Execution.delayUntil(() => Bank.loaded(), 3000);
    const banked = Bank.count(ESSENCE);
    if (banked === 0) {
      if (++this.emptyReads >= 3) {
        stopBot(this.bot, "RuneCrafter: out of Rune essence in the bank (three reads)");
      }
      return;
    }
    this.emptyReads = 0;
    await Bank.withdrawX(ESSENCE, Math.min(TRADE_LOAD, banked, Inventory.free()));
    this.stocked = await Execution.delayUntil(() => essCount() > 0, 3000);
    this.bot.countTrip();
    this.bot.log(`withdrew ${essCount()} essence (bank run ${this.bot.tripsTotal()})`);
  }
}

class MuleTakeTrade {
  bot;
  openedAt = 0;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    if (!Trade.active()) {
      this.openedAt = 0;
      return false;
    }
    if (this.openedAt === 0) {
      this.openedAt = Date.now();
    }
    return true;
  }
  async execute() {
    this.bot.takeRequester();
    if (Trade.onConfirmScreen()) {
      this.bot.setStatus("confirming the essence trade");
      const before = essCount();
      await Trade.accept();
      if (await Execution.delayUntil(() => !Trade.active(), 3000) && essCount() > before) {
        this.bot.countTrade(essCount() - before);
        this.bot.log(`received ${essCount() - before} essence`);
      }
      return;
    }
    if (Trade.myOffer().length > 0) {
      this.bot.log("safety: something is in MY trade offer — declining so nothing is given away");
      await Trade.decline();
      return;
    }
    const theirEssence = Trade.theirOffer().filter((o) => (o.name ?? "").toLowerCase() === ESSENCE.toLowerCase()).reduce((s, o) => s + Math.max(1, o.count), 0);
    if (theirEssence <= 0) {
      if (Date.now() - this.openedAt > EMPTY_TRADE_MS) {
        this.bot.log("trade partner never offered essence — declining so waiting runners get served");
        await Trade.decline();
        return;
      }
      this.bot.setStatus("waiting for the essence offer");
      await Execution.delayTicks(1);
      return;
    }
    if (theirEssence > Inventory.free()) {
      this.bot.log(`can't fit ${theirEssence} essence (${Inventory.free()} slots free) — declining so the pack can be cleared first`);
      await Trade.decline();
      return;
    }
    this.bot.setStatus(`accepting ${theirEssence} essence`);
    await Trade.accept();
  }
}

class MuleAnswerRequest {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return inTemple() && !Trade.active() && this.bot.pendingRequester() !== null;
  }
  async execute() {
    const name = this.bot.takeRequester();
    if (!name) {
      return;
    }
    const runner = await Execution.delayUntil(() => playerNamed(name, ADJACENT) !== null, 1800) ? playerNamed(name, ADJACENT) : null;
    if (!runner) {
      this.bot.log(`'${name}' asked to trade but never reached the altar — waiting for the next request`);
      return;
    }
    this.bot.setStatus(`answering ${runner.name}'s trade request`);
    this.bot.log(`answering ${runner.name}'s trade request`);
    await Trade.request(runner.name ?? name);
    await Execution.delayUntil(() => Trade.active(), 4000);
  }
}

class MuleDropJunk {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  junk() {
    return packJunk([...this.bot.muleKeep(), ESSENCE]);
  }
  validate() {
    return inTemple() && !Trade.active() && this.junk().length > 0;
  }
  async execute() {
    this.bot.setStatus("dropping random-event junk");
    for (let guard = 0;guard < 28; guard++) {
      const item = this.junk()[0];
      if (!item) {
        break;
      }
      this.bot.log(`dropping ${item.name ?? `item#${item.id}`} — it blocks a full essence delivery`);
      const before = Inventory.used();
      if (!await item.interact("Drop")) {
        await Execution.delayTicks(1);
        return;
      }
      await Execution.delayUntil(() => Inventory.used() < before, 3000);
    }
    const left = this.junk();
    if (left.length > 0) {
      stopBot(this.bot, `RuneCrafter: could not drop ${left.map((i) => `${i.name ?? "unnamed"}#${i.id}`).join(", ")}`);
    }
  }
}

class MulePrepare {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return !inTemple() && !Trade.active() && essCount() === 0 && (packJunk(this.bot.muleKeep()).length > 0 || !this.bot.talismanName() || !Inventory.contains(this.bot.talismanName()));
  }
  async execute() {
    this.bot.setStatus("cleaning the pack at the bank");
    this.bot.log("bank trip — the pack needs just the talisman (+ the rune stack) to take trades");
    if (!await openBank(this.bot)) {
      return;
    }
    if (!await this.bot.resolveAtBank()) {
      return;
    }
    if (!this.bot.atRecipeBank()) {
      if (!await ensureDramen(this.bot)) {
        return;
      }
      await Bank.close();
      return;
    }
    if (!await stripEntranaGear(this.bot)) {
      return;
    }
    if (!await cleanPack(this.bot, this.bot.muleKeep())) {
      return;
    }
    if (!await ensureTalisman(this.bot)) {
      return;
    }
    if (!await ensureDramen(this.bot)) {
      return;
    }
    this.bot.log("pack is clean — heading back to the altar");
  }
}

class MuleWait {
  bot;
  constructor(bot) {
    this.bot = bot;
  }
  validate() {
    return inTemple() && essCount() === 0;
  }
  async execute() {
    const altar = await approachAltar(this.bot);
    if (altar && altar.distance() > ALTAR_PARK) {
      this.bot.setStatus("parking at the altar");
      this.bot.log("taking up station next to the altar");
      await DirectNavigator.walkTo(altar.tile(), ALTAR_PARK, 15000);
      return;
    }
    this.bot.setStatus("waiting for a trade request");
    await Execution.delayTicks(2);
  }
}
var RuneCrafter_default = defineBot({
  name: SCRIPT_NAME,
  version: "1.0.0",
  description: "AIO Runecrafting (all 2004 altars except Nature). Best picks the highest rune your level and talismans allow. Cosmic banks in Zanaris (Lost City + wielded Dramen staff at the swamp shed).",
  category: "Runecrafting",
  tags: ["runecrafting", "banking", "trade", "runner", "mule", "zanaris", "cosmic"],
  settingsSchema: SETTINGS,
  create: () => new RuneCrafter
});
export {
  RuneCrafter_default as default
};
