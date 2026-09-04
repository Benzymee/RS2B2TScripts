/**
 * CatherbyRangeCooker. Cooks raw fish from Catherby bank on the Range next to the bank.
 * Load URL: https://cdn.jsdelivr.net/gh/Benzymee/RS2B2TScripts@main/CatherbyRangeCooker.js
 */
const SUPPORTED_API_VERSION = 1;
const abi = globalThis.__rs2b0t;
if (!abi) {
  throw new Error("CatherbyRangeCooker: globalThis.__rs2b0t missing \u2014 load inside rs2b0t bot.html");
}
if (abi.apiVersion !== SUPPORTED_API_VERSION) {
  throw new Error(
    `CatherbyRangeCooker: ABI ${abi.apiVersion} != supported ${SUPPORTED_API_VERSION}`
  );
}
const {
  defineBot,
  Execution,
  Game,
  LoopingBot: LoopingBotBase,
  Locs,
  Inventory,
  Bank,
  Banking,
  Traversal,
  Tile,
  Skills,
  ChatDialog
} = abi;
const SCRIPT_NAME = "CatherbyRangeCooker";
const WELCOME_SCREEN_ID = 5993;
function welcomeHost() {
  return globalThis.rs2b0t ?? null;
}
function stopScript() {
  const host = welcomeHost();
  if (typeof host?.stopScript === "function") {
    host.stopScript();
    return;
  }
  if (typeof host?.runner?.stop === "function") {
    host.runner.stop();
  }
}
function isWelcomeModalOpen() {
  const host = welcomeHost();
  if (!host?.reader) {
    return false;
  }
  const { reader } = host;
  const main = typeof reader.modals === "function" ? reader.modals?.().main ?? -1 : -1;
  if (main === -1) {
    return false;
  }
  if (main === WELCOME_SCREEN_ID) {
    return true;
  }
  if (typeof reader.mainModalTexts !== "function") {
    return false;
  }
  const texts = reader.mainModalTexts();
  return texts.some(
    (t) => /welcome to runescape/i.test(t) || /unread messages?/i.test(t) || /jagex staff will never email/i.test(t)
  );
}
async function dismissWelcomeScreen() {
  if (!isWelcomeModalOpen()) {
    return false;
  }
  const host = welcomeHost();
  if (!host?.reader || !host?.actions) {
    return false;
  }
  const { reader, actions } = host;
  for (let attempt = 0; attempt < 8 && isWelcomeModalOpen(); attempt++) {
    const main = reader.modals?.().main ?? -1;
    if (main === -1) {
      break;
    }
    let clicked = typeof actions.closeModal === "function" && actions.closeModal();
    if (!clicked && typeof reader.closeButtonComId === "function" && typeof actions.ifButton === "function") {
      const closeId = reader.closeButtonComId(main);
      if (closeId !== -1) {
        clicked = !!actions.ifButton(closeId);
      }
    }
    if (!clicked && typeof reader.buttonByText === "function" && typeof actions.ifButton === "function") {
      for (const label of ["Close Window", "Close"]) {
        const btn = reader.buttonByText(main, label);
        if (btn !== -1 && actions.ifButton(btn)) {
          clicked = true;
          break;
        }
      }
    }
    if (!clicked && typeof actions.closeMainModal === "function") {
      actions.closeMainModal(main);
    }
    await Execution.delay(250);
  }
  return !isWelcomeModalOpen();
}
const BANK_STAND = new Tile(2809, 3441, 0);
const RANGE_STAND = new Tile(2817, 3443, 0);
const RANGE_LOC = new Tile(2817, 3444, 0);
const RANGE_LEASH = 8;
const COOK_LEVEL = {
  shrimp: 1,
  anchovy: 1,
  sardine: 1,
  herring: 5
};
const FISH_OPTION_SHRIMP = "Shrimp";
const FISH_OPTION_ANCHOVIES = "Anchovies";
const FISH_OPTION_SARDINE = "Raw sardine";
const FISH_OPTION_HERRING = "Raw herring";
const FISH_OPTION_EVERYTHING = "Everything (at level)";
const FISH_OPTIONS = [
  FISH_OPTION_SHRIMP,
  FISH_OPTION_ANCHOVIES,
  FISH_OPTION_SARDINE,
  FISH_OPTION_HERRING,
  FISH_OPTION_EVERYTHING
];
const RAW_WITHDRAW_NAMES = {
  shrimp: ["Raw shrimps", "Raw shrimp"],
  anchovy: ["Raw anchovies", "Raw anchovy"],
  sardine: ["Raw sardine"],
  herring: ["Raw herring"]
};
const ALL_KINDS = ["shrimp", "anchovy", "sardine", "herring"];
function fmtXph(n) {
  if (n >= 1e5) {
    return `${(n / 1e3).toFixed(0)}k`;
  }
  if (n >= 1e4) {
    return `${(n / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(n));
}
function fmtElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1e3));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function prefStorageKey(key) {
  const box = typeof location !== "undefined" ? new URLSearchParams(location.search).get("box") : null;
  const suffix = `set:${SCRIPT_NAME}:${key}`;
  return box ? `rs2b0t:${box}:${suffix}` : `rs2b0t:${suffix}`;
}
function readPrefRaw(key) {
  const k = prefStorageKey(key);
  try {
    if (typeof sessionStorage !== "undefined") {
      const v = sessionStorage.getItem(k);
      if (v !== null) {
        return v;
      }
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(k);
    }
  } catch {
  }
  return null;
}
function readPrefStr(key, fallback) {
  const raw = readPrefRaw(key);
  return raw !== null ? raw.trim() : fallback;
}
function isPanelPaused() {
  return !!document.querySelector(".rs2b0t-value.rs2b0t-state-paused");
}
function unlockPausedPrefsUi() {
  if (!isPanelPaused()) {
    return;
  }
  for (const btn of document.querySelectorAll("button.rs2b0t-param-edit")) {
    if ((btn.textContent || "").includes("Edit parameters")) {
      btn.disabled = false;
      btn.title = "Editable while paused \u2014 applies on the next loop / Resume";
    }
  }
  for (const backdrop of document.querySelectorAll(".rs2b0t-modal-backdrop")) {
    if (backdrop.style.display !== "flex") {
      continue;
    }
    for (const el of backdrop.querySelectorAll("input, select, textarea")) {
      el.disabled = false;
    }
  }
}
const PAINT_FONT_ID = "benzyme-catherby-cooker-font-v1";
const PAINT_FONT = '13px Exo, "Bebas Neue", "Bitcount Ink", sans-serif';
function ensurePaintFont() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(PAINT_FONT_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = PAINT_FONT_ID;
  style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bitcount+Ink:wght@100..900&family=Exo:ital,wght@0,100..900;1,100..900&display=swap');";
  document.head.appendChild(style);
}
function fishKind(name) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("anchov")) {
    return "anchovy";
  }
  if (n.includes("shrimp")) {
    return "shrimp";
  }
  if (n.includes("herring")) {
    return "herring";
  }
  if (n.includes("sardine")) {
    return "sardine";
  }
  return null;
}
function rawFishKind(name) {
  const n = (name ?? "").toLowerCase();
  if (!n.startsWith("raw ")) {
    return null;
  }
  return fishKind(n);
}
function isKnownRaw(name) {
  return rawFishKind(name) !== null;
}
function isCookedFish(name) {
  if (!name) {
    return false;
  }
  const n = name.toLowerCase().trim();
  if (n.startsWith("raw ") || n.startsWith("burnt ")) {
    return false;
  }
  return n === "shrimps" || n === "shrimp" || n === "anchovies" || n === "anchovy" || n === "sardine" || n === "herring";
}
function isBurntFish(name) {
  if (!name) {
    return false;
  }
  const n = name.toLowerCase();
  return n.startsWith("burnt ") || n === "burnt fish";
}
function canCookKind(kind) {
  if (!kind || COOK_LEVEL[kind] == null) {
    return false;
  }
  return Skills.level("cooking") >= COOK_LEVEL[kind];
}
function canCookRaw(name) {
  const kind = rawFishKind(name);
  return kind !== null && canCookKind(kind);
}
function optionToKind(option) {
  switch (option) {
    case FISH_OPTION_SHRIMP:
      return "shrimp";
    case FISH_OPTION_ANCHOVIES:
      return "anchovy";
    case FISH_OPTION_SARDINE:
      return "sardine";
    case FISH_OPTION_HERRING:
      return "herring";
    default:
      return null;
  }
}
function normalizeFishOption(raw) {
  const s = String(raw ?? "").trim();
  const hit = FISH_OPTIONS.find((o) => o.toLowerCase() === s.toLowerCase());
  if (hit) {
    return hit;
  }
  const soft = s.toLowerCase();
  if (soft.includes("every") || soft.includes("all")) {
    return FISH_OPTION_EVERYTHING;
  }
  if (soft.includes("anchov")) {
    return FISH_OPTION_ANCHOVIES;
  }
  if (soft.includes("shrimp")) {
    return FISH_OPTION_SHRIMP;
  }
  if (soft.includes("herring")) {
    return FISH_OPTION_HERRING;
  }
  if (soft.includes("sardine")) {
    return FISH_OPTION_SARDINE;
  }
  return FISH_OPTION_SHRIMP;
}
function isModeRaw(name, mode) {
  if (!canCookRaw(name)) {
    return false;
  }
  if (mode === FISH_OPTION_EVERYTHING) {
    return true;
  }
  const want = optionToKind(mode);
  return want !== null && rawFishKind(name) === want;
}
function countMatching(pred) {
  return Inventory.items().filter((i) => pred(i.name)).reduce((n, i) => n + Math.max(1, i.count), 0);
}
function cookableCount(mode) {
  return countMatching((n) => isModeRaw(n, mode));
}
function cookedFishCount() {
  return countMatching(isCookedFish);
}
function burntCount() {
  return countMatching(isBurntFish);
}
function lastCookableRaw(mode) {
  const items = Inventory.items();
  for (let i = items.length - 1; i >= 0; i--) {
    const name = items[i].name;
    if (isModeRaw(name, mode)) {
      return items[i];
    }
  }
  return null;
}
function countCookableNamed(fragment, mode) {
  const want = fragment.toLowerCase();
  return countMatching(
    (n) => isModeRaw(n, mode) && (n ?? "").toLowerCase().includes(want)
  );
}
function matchCookProduct(products, preferName, mode) {
  if (!products || products.length === 0) {
    return null;
  }
  const prefer = (preferName ?? "").toLowerCase();
  if (prefer) {
    const hit = products.find((p) => (p ?? "").toLowerCase() === prefer);
    if (hit) {
      return hit;
    }
    const soft = products.find(
      (p) => (p ?? "").toLowerCase().includes(prefer.replace(/^raw\s+/, ""))
    );
    if (soft) {
      return soft;
    }
  }
  for (const frag of ["anchov", "shrimp", "herring", "sardine"]) {
    if (countCookableNamed(frag, mode) <= 0) {
      continue;
    }
    const hit = products.find((p) => (p ?? "").toLowerCase().includes(frag));
    if (hit) {
      return hit;
    }
  }
  return products[0] ?? null;
}
function bankItemCount(pred) {
  if (!Bank.isOpen()) {
    return 0;
  }
  return Bank.items().filter((i) => pred(i.name)).reduce((n, i) => n + Math.max(1, i.count ?? 1), 0);
}
function bankCookableCount(mode) {
  return bankItemCount((n) => isModeRaw(n, mode));
}
function bankFindRawName(kind) {
  const names = RAW_WITHDRAW_NAMES[kind] ?? [];
  for (const name of names) {
    if ((Bank.count(name) || 0) > 0) {
      return name;
    }
  }
  const soft = Bank.items().find((i) => rawFishKind(i.name) === kind && canCookKind(kind));
  return soft?.name ?? null;
}
function nextWithdrawKind(mode) {
  if (mode === FISH_OPTION_EVERYTHING) {
    for (const kind2 of ALL_KINDS) {
      if (!canCookKind(kind2)) {
        continue;
      }
      if (bankFindRawName(kind2)) {
        return kind2;
      }
    }
    return null;
  }
  const kind = optionToKind(mode);
  if (!kind || !canCookKind(kind)) {
    return null;
  }
  return bankFindRawName(kind) ? kind : null;
}
function isShutDoor(loc) {
  const name = (loc.name ?? "").toLowerCase();
  if (!name.includes("door") && !name.includes("gate")) {
    return false;
  }
  return loc.actions().some((a) => /^open/i.test(a));
}
function openDoorOp(loc) {
  return loc.actions().find((a) => /^open/i.test(a)) ?? null;
}
class CatherbyRangeCooker extends LoopingBotBase {
  status = "starting";
  startedAt = 0;
  cookXpAtStart = 0;
  cooked = 0;
  bankTrips = 0;
  fishMode = FISH_OPTION_SHRIMP;
  done = false;
  unlockTimer = null;
  async onStart() {
    await Execution.delayUntil(() => Game.ingame() && Game.tile() !== null, 0);
    Traversal.preload();
    this.startPausedPrefUnlock();
    ensurePaintFont();
    this.syncPrefs({ silent: true });
    this.startedAt = Date.now();
    this.cookXpAtStart = Skills.xp("cooking");
    this.cooked = 0;
    this.bankTrips = 0;
    this.done = false;
    this.on("skill.level", (e) => {
      if (e.name === "cooking") {
        this.log(`cooking ${e.previous} \u2192 ${e.level}`);
      }
    });
    const cookLvl = Skills.level("cooking");
    this.log(
      `CatherbyRangeCooker \u2014 mode: ${this.fishMode}, cooking ${cookLvl}; bank @ ${BANK_STAND.x},${BANK_STAND.z} \u2192 Range @ ${RANGE_STAND.x},${RANGE_STAND.z}`
    );
    if (this.fishMode !== FISH_OPTION_EVERYTHING) {
      const kind = optionToKind(this.fishMode);
      if (kind && !canCookKind(kind)) {
        this.log(
          `WARNING: need Cooking ${COOK_LEVEL[kind]} for ${this.fishMode} (you have ${cookLvl}) \u2014 will stop if bank has nothing else cookable`
        );
      }
    }
    this.status = "banking";
  }
  startPausedPrefUnlock() {
    unlockPausedPrefsUi();
    this.unlockTimer = setInterval(() => unlockPausedPrefsUi(), 400);
  }
  onStop() {
    if (this.unlockTimer != null) {
      clearInterval(this.unlockTimer);
      this.unlockTimer = null;
    }
    this.log(
      `stopped \u2014 cooked ${this.cooked}, bank trips ${this.bankTrips} (${this.status})`
    );
  }
  syncPrefs({ silent = false } = {}) {
    const prev = this.fishMode;
    this.fishMode = normalizeFishOption(
      readPrefStr("fishMode", this.settings.str("fishMode", FISH_OPTION_SHRIMP))
    );
    if (!silent && prev !== this.fishMode) {
      this.log(`prefs: fish \u2192 ${this.fishMode}`);
    }
  }
  noteCooked(beforeCooked) {
    const now = cookedFishCount();
    if (now > beforeCooked) {
      const gained = now - beforeCooked;
      this.cooked += gained;
      return gained;
    }
    return 0;
  }
  finishDone(reason) {
    this.done = true;
    this.status = "done";
    this.log(reason);
    stopScript();
  }
  async loop() {
    if (!Game.ingame()) {
      await Execution.delayTicks(5);
      return;
    }
    if (this.done) {
      await Execution.delayTicks(5);
      return;
    }
    if (await dismissWelcomeScreen()) {
      this.status = "close welcome";
      return;
    }
    this.syncPrefs({ silent: true });
    unlockPausedPrefsUi();
    if (ChatDialog.canContinue()) {
      this.status = "continue dialog";
      await ChatDialog.continue();
      return;
    }
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      return;
    }
    if (burntCount() > 0 && cookableCount(this.fishMode) === 0) {
      await this.dropBurnt();
      return;
    }
    if (cookableCount(this.fishMode) > 0) {
      await this.cookLoad();
      return;
    }
    if (cookedFishCount() > 0 || countMatching(isKnownRaw) > 0) {
      await this.bankCycle();
      return;
    }
    await this.bankCycle();
  }
  findRange() {
    return Locs.query().name("Range", "Cooking range", "Fire", "Fireplace").where((l) => Tile.from(l.tile()).distanceTo(RANGE_LOC) <= RANGE_LEASH).nearest() ?? Locs.query().name("Range", "Cooking range").nearest();
  }
  async openNearbyDoor() {
    const door = Locs.query().where((l) => isShutDoor(l)).where((l) => l.distance() <= 3).nearest();
    if (!door) {
      return false;
    }
    const op = openDoorOp(door);
    if (!op) {
      return false;
    }
    this.log(`opening ${door.name}`);
    await door.interact(op);
    await Execution.delayTicks(2);
    return true;
  }
  async walkToRange() {
    this.status = "walking to range";
    this.log(`walking to Range ${RANGE_STAND.x},${RANGE_STAND.z}`);
    await Traversal.walkResilient(RANGE_STAND, {
      radius: 1,
      log: (m) => this.log(`  ${m}`)
    });
    await this.openNearbyDoor();
    const here = Game.tile();
    if (here && Tile.from(here).distanceTo(RANGE_STAND) > 2) {
      await Traversal.walkTo(RANGE_STAND, { radius: 1, timeoutMs: 12e3 });
    }
    if (!this.findRange()) {
      await Traversal.walkTo(RANGE_LOC, { radius: 1, timeoutMs: 8e3 });
      await this.openNearbyDoor();
    }
  }
  async chooseCookProduct() {
    const products = ChatDialog.makeProducts();
    const raw = lastCookableRaw(this.fishMode);
    const hint = matchCookProduct(products, raw?.name, this.fishMode);
    const kind = fishKind(hint) || fishKind(raw?.name);
    const frag = kind === "anchovy" ? "anchov" : kind === "shrimp" ? "shrimp" : kind === "herring" ? "herring" : kind === "sardine" ? "sardine" : null;
    const batch = frag ? Math.max(1, Math.min(countCookableNamed(frag, this.fishMode), 28)) : Math.max(1, Math.min(cookableCount(this.fishMode), 28));
    this.status = "cook make-menu";
    this.log(
      `cook menu: [${products.join(", ")}] pick=${hint ?? "none"} x${batch} (cook ${Skills.level("cooking")})`
    );
    let picked = false;
    if (hint && typeof ChatDialog.makeX === "function") {
      picked = await ChatDialog.makeX(hint, batch);
    }
    if (!picked && hint) {
      picked = await ChatDialog.make(hint);
    }
    if (!picked) {
      picked = await ChatDialog.make();
    }
    if (!picked) {
      this.log("could not pick cook product");
      await Execution.delayTicks(1);
      return;
    }
    const stillThisType = () => frag ? countCookableNamed(frag, this.fishMode) > 0 : cookableCount(this.fishMode) > 0;
    await Execution.delayUntil(
      () => !ChatDialog.isMakeMenu() && (Game.animating() || !stillThisType()),
      5e3
    );
    let cookedMark = cookedFishCount();
    let idle = 0;
    for (let guard = 0; guard < 400 && stillThisType(); guard++) {
      if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
        this.noteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.noteCooked(cookedMark) > 0) {
        cookedMark = cookedFishCount();
        idle = 0;
      } else if (!Game.animating() && ++idle >= 14) {
        break;
      } else if (Game.animating()) {
        idle = 0;
      }
    }
    this.noteCooked(cookedMark);
  }
  async cookLoad() {
    if (cookableCount(this.fishMode) === 0) {
      return;
    }
    const here = Game.tile();
    let oven = this.findRange();
    if (!here || Tile.from(here).distanceTo(RANGE_STAND) > 2 || !oven) {
      await this.walkToRange();
      oven = this.findRange();
    }
    if (!oven) {
      this.log("WARNING: no Range near bank house \u2014 banking instead");
      await this.bankCycle();
      return;
    }
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      return;
    }
    const raw = lastCookableRaw(this.fishMode);
    if (!raw) {
      return;
    }
    const beforeCookable = cookableCount(this.fishMode);
    let cookedMark = cookedFishCount();
    const beforeXp = Skills.xp("cooking");
    this.status = `cooking ${raw.name}`;
    this.log(
      `use ${raw.name} on ${oven.name ?? "Range"} (${beforeCookable} cookable, cook lvl ${Skills.level("cooking")})`
    );
    if (!await raw.useOn(oven)) {
      await this.openNearbyDoor();
      await Execution.delayTicks(2);
      return;
    }
    const started = await Execution.delayUntil(
      () => cookableCount(this.fishMode) < beforeCookable || Skills.xp("cooking") > beforeXp || ChatDialog.isMakeMenu() || ChatDialog.canContinue(),
      4e3
    );
    if (ChatDialog.isMakeMenu()) {
      await this.chooseCookProduct();
      return;
    }
    if (!started && cookableCount(this.fishMode) >= beforeCookable) {
      this.log("cook did not start \u2014 re-pathing to range");
      await this.walkToRange();
      return;
    }
    let mark = cookableCount(this.fishMode);
    let idle = 0;
    for (let guard = 0; guard < 400 && cookableCount(this.fishMode) > 0; guard++) {
      if (ChatDialog.canContinue() || ChatDialog.isMakeMenu()) {
        this.noteCooked(cookedMark);
        return;
      }
      await Execution.delayTicks(1);
      if (this.noteCooked(cookedMark) > 0) {
        cookedMark = cookedFishCount();
      }
      const now = cookableCount(this.fishMode);
      if (now < mark) {
        mark = now;
        idle = 0;
      } else if (!Game.animating() && ++idle >= 14) {
        break;
      } else if (Game.animating()) {
        idle = 0;
      }
    }
    this.noteCooked(cookedMark);
    if (cookableCount(this.fishMode) === 0 && burntCount() > 0) {
      await this.dropBurnt();
    }
  }
  async dropBurnt() {
    this.status = "dropping burnt";
    for (let guard = 0; guard < 28; guard++) {
      const item = Inventory.items().find((i) => isBurntFish(i.name));
      if (!item) {
        break;
      }
      const before = Inventory.used();
      await item.interact("Drop");
      await Execution.delayUntil(() => Inventory.used() < before, 3e3);
      await Execution.delay(80 + Math.floor(Math.random() * 140));
    }
  }
  /**
   * Deposit cooked/raw leftovers, withdraw next cookable load, or stop when bank is empty.
   */
  async bankCycle() {
    this.status = "banking";
    if (!Bank.isOpen()) {
      this.log(`opening Catherby bank (${this.fishMode})`);
      if (!await Banking.open({
        stand: BANK_STAND,
        log: (m) => this.log(`  ${m}`)
      })) {
        this.log("could not open bank \u2014 retrying");
        await Execution.delayTicks(3);
        return;
      }
    }
    if (typeof Bank.loaded === "function") {
      await Execution.delayUntil(() => Bank.loaded() || Bank.items().length > 0, 3e3);
    }
    await Execution.delayTicks(1);
    if (Inventory.used() > 0) {
      this.log("depositing inventory");
      if (typeof Bank.depositInventory === "function") {
        await Bank.depositInventory();
      } else {
        await Bank.depositAllMatching(() => true);
      }
      await Execution.delayTicks(1);
    }
    this.bankTrips++;
    const free = typeof Inventory.free === "function" ? Inventory.free() : 28;
    if (free <= 0) {
      this.log("inventory still full after deposit \u2014 retrying");
      await Execution.delayTicks(2);
      return;
    }
    let withdrawn = 0;
    for (let guard = 0; guard < 8; guard++) {
      const slots = typeof Inventory.free === "function" ? Inventory.free() : 28 - Inventory.used();
      if (slots <= 0) {
        break;
      }
      const kind = nextWithdrawKind(this.fishMode);
      if (!kind) {
        break;
      }
      const name = bankFindRawName(kind);
      if (!name) {
        break;
      }
      const inBank = Bank.count(name) || bankItemCount((n) => (n ?? "") === name) || 0;
      const take = Math.min(slots, Math.max(1, inBank));
      this.log(`withdrawing ${take}\xD7 ${name}`);
      if (!await Bank.withdrawX(name, take)) {
        const soft = bankFindRawName(kind);
        if (!soft || soft === name || !await Bank.withdrawX(soft, take)) {
          this.log(`withdraw failed for ${name}`);
          break;
        }
      }
      withdrawn += take;
      await Execution.delayTicks(1);
      if (this.fishMode !== FISH_OPTION_EVERYTHING) {
        break;
      }
    }
    const leftInBank = bankCookableCount(this.fishMode);
    await Bank.close();
    if (cookableCount(this.fishMode) > 0) {
      this.status = "walking to range";
      this.log(
        `withdrew cookables \u2014 cooking next load` + (leftInBank > 0 ? ` (${leftInBank} still in bank)` : "")
      );
      return;
    }
    if (withdrawn === 0 && leftInBank <= 0) {
      const cookLvl = Skills.level("cooking");
      const kind = optionToKind(this.fishMode);
      const need = kind ? COOK_LEVEL[kind] : null;
      if (kind && need != null && cookLvl < need) {
        this.finishDone(
          `done \u2014 need Cooking ${need} for ${this.fishMode} (you have ${cookLvl})`
        );
        return;
      }
      this.finishDone(
        this.fishMode === FISH_OPTION_EVERYTHING ? `done \u2014 no raw fish in bank you can cook at Cooking ${cookLvl}` : `done \u2014 no more ${this.fishMode} in bank (Cooking ${cookLvl})`
      );
      return;
    }
    if (withdrawn === 0) {
      this.finishDone(
        `done \u2014 could not withdraw cookable fish for ${this.fishMode} (Cooking ${Skills.level("cooking")})`
      );
    }
  }
  onPaint(ctx) {
    ensurePaintFont();
    const elapsed = Date.now() - this.startedAt;
    const hrs = elapsed / 36e5;
    const cookXp = Skills.xp("cooking") - this.cookXpAtStart;
    const cookXph = hrs > 8e-3 ? cookXp / hrs : 0;
    const cookedPh = hrs > 8e-3 ? this.cooked / hrs : 0;
    const lines = [
      `Benzyme's Catherby Cooker  Cook ${Skills.level("cooking")}`,
      `time ${fmtElapsed(elapsed)}  \xB7  ${this.fishMode}  \xB7  ${this.status}`,
      `cooked ${this.cooked} (${fmtXph(cookedPh)}/hr)  trips ${this.bankTrips}`,
      `raw ${cookableCount(this.fishMode)}  cooked inv ${cookedFishCount()}  Cook XP ${fmtXph(cookXph)}/hr`
    ];
    ctx.font = PAINT_FONT;
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    const pad = 6;
    const lineH = 18;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(6, 6, maxW + pad * 2, pad * 2 + lines.length * lineH);
    ctx.fillStyle = "#7eb8da";
    lines.forEach((line, i) => {
      ctx.fillText(line, 6 + pad, 6 + pad + (i + 1) * lineH - 4);
    });
  }
}
var CatherbyRangeCooker_default = defineBot({
  name: SCRIPT_NAME,
  version: "1.0.0",
  category: "Cooking",
  tags: ["cooking", "catherby", "range", "shrimp", "anchovies", "sardine", "herring", "bank"],
  description: "Withdraws raw fish from Catherby bank, cooks them on the Range next to the bank, and deposits the cooked fish.",
  settingsSchema: {
    fishMode: {
      type: "string",
      default: FISH_OPTION_SHRIMP,
      options: FISH_OPTIONS,
      label: "Fish to cook",
      group: "Cooking",
      help: "Shrimp / Anchovies / Raw sardine / Raw herring withdraw that fish only. Everything (at level) cooks any of those raws in your bank that your Cooking level allows (herring needs 5)."
    }
  },
  create: () => new CatherbyRangeCooker()
});
export {
  CatherbyRangeCooker_default as default
};
