/**
 * Daggerheart PF2e Token Pack Mapping (NBSamael)
 *
 * - Gives this module priority over other compendium art providers (e.g. daggerheart-core).
 * - Lets the GM re-apply this module's art to adversaries already imported into the world.
 */

const MODULE_ID = "daggerheart-pf2e-token-pack-mapping-nbs";
const PACK_ID = "daggerheart.adversaries";
const MAPPING_PATH = `modules/${MODULE_ID}/mapping.json`;

const loc = (key, data) => (data ? game.i18n.format(`${MODULE_ID}.${key}`, data) : game.i18n.localize(`${MODULE_ID}.${key}`));

/* -------------------------------------------- */
/*  Compendium art priority                     */
/* -------------------------------------------- */

/**
 * Whether this module currently has the highest compendium art priority.
 * @returns {boolean}
 */
function hasTopPriority() {
  const packages = game.compendiumArt.getPackages();
  return !packages.length || packages[0].packageId === MODULE_ID;
}

/**
 * Store an explicit priority for every art provider, placing this module first.
 * Other providers keep their relative order and their portrait/token toggles.
 */
async function setTopPriority() {
  const SETTING = game.compendiumArt.SETTING;
  const packages = game.compendiumArt.getPackages();
  const mine = packages.find(p => p.packageId === MODULE_ID);
  if ( !mine ) return false;
  const others = packages.filter(p => p.packageId !== MODULE_ID);
  const config = foundry.utils.deepClone(game.settings.get("core", SETTING) ?? {});
  const toggles = p => ({ portraits: p.portraits, tokens: p.tokens, items: p.items });
  for ( const p of others ) config[p.packageId] = { ...toggles(p), ...config[p.packageId], priority: p.priority };
  const top = others.length ? Math.min(...others.map(p => p.priority)) : CONST.SORT_INTEGER_DENSITY * 2;
  config[MODULE_ID] = { ...toggles(mine), ...config[MODULE_ID], priority: top - CONST.SORT_INTEGER_DENSITY };
  await game.settings.set("core", SETTING, config);
  return true;
}

/**
 * Ask the GM to give this module priority, then offer a reload (compendium art is collated at startup).
 * @param {object} [options]
 * @param {boolean} [options.firstRun=false]  Whether this is the automatic prompt shown on first activation.
 */
async function promptPriority({ firstRun = false } = {}) {
  if ( hasTopPriority() ) {
    if ( !firstRun ) ui.notifications.info(loc("Priority.AlreadyTop"));
    return;
  }
  const others = game.compendiumArt.getPackages()
    .filter(p => p.packageId !== MODULE_ID)
    .map(p => `<li>${foundry.utils.escapeHTML(p.title)}</li>`).join("");
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("Priority.Title"), icon: "fa-solid fa-ranking-star" },
    position: { width: 480 },
    content: `<p>${loc("Priority.Body")}</p><ul>${others}</ul><p class="hint">${loc("Priority.Hint")}</p>`
  });
  if ( !confirmed ) return;
  if ( await setTopPriority() ) {
    ui.notifications.info(loc("Priority.Done"));
    await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
  }
}

/* -------------------------------------------- */
/*  Re-apply art to world adversaries           */
/* -------------------------------------------- */

/**
 * Extract the compendium document id of a world actor imported from the adversaries pack.
 * @param {Actor} actor
 * @returns {string|null}
 */
function getSourceId(actor) {
  const uuid = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId;
  const prefix = `Compendium.${PACK_ID}.Actor.`;
  return uuid?.startsWith(prefix) ? uuid.slice(prefix.length) : null;
}

/** Token fields we write on placed tokens (randomImg only makes sense on the prototype). */
function tokenArt(art) {
  const { texture, ring } = art.token ?? {};
  return foundry.utils.deepClone({ texture, ring });
}

function tokenDiffers(tokenLike, art) {
  return (tokenLike.texture?.src !== art.token?.texture?.src)
    || (tokenLike.ring?.subject?.texture !== art.token?.ring?.subject?.texture)
    || (tokenLike.ring?.enabled !== art.token?.ring?.enabled);
}

/**
 * Find every world actor and placed token that could receive this module's art.
 */
async function collectTargets() {
  const json = await foundry.utils.fetchJsonWithTimeout(MAPPING_PATH);
  const mapping = json[PACK_ID] ?? {};
  const actors = [];          // {actor, art, portrait: bool, token: bool}
  const matched = new Map();  // actorId -> art
  for ( const actor of game.actors ) {
    const art = mapping[getSourceId(actor)];
    if ( !art ) continue;
    matched.set(actor.id, art);
    const portrait = actor.img !== art.actor;
    const token = tokenDiffers(actor.prototypeToken, art);
    if ( portrait || token ) actors.push({ actor, art, portrait, token });
  }
  const tokens = [];          // {scene, token, art}
  for ( const scene of game.scenes ) {
    for ( const token of scene.tokens ) {
      const art = matched.get(token.actorId);
      if ( art && tokenDiffers(token, art) ) tokens.push({ scene, token, art });
    }
  }
  return { actors, tokens, matchedCount: matched.size };
}

async function applyArt({ actors, tokens }, { portraits, prototypes, placed }) {
  const actorUpdates = [];
  for ( const { actor, art, portrait, token } of actors ) {
    const update = { _id: actor.id };
    if ( portraits && portrait ) update.img = art.actor;
    if ( prototypes && token ) update.prototypeToken = foundry.utils.deepClone(art.token);
    if ( Object.keys(update).length > 1 ) actorUpdates.push(update);
  }
  if ( actorUpdates.length ) await Actor.implementation.updateDocuments(actorUpdates);

  let tokenCount = 0;
  if ( placed ) {
    const byScene = new Map();
    for ( const { scene, token, art } of tokens ) {
      if ( !byScene.has(scene) ) byScene.set(scene, []);
      byScene.get(scene).push({ _id: token.id, ...tokenArt(art) });
    }
    for ( const [scene, updates] of byScene ) {
      await scene.updateEmbeddedDocuments("Token", updates);
      tokenCount += updates.length;
    }
  }
  return { actorCount: actorUpdates.length, tokenCount };
}

async function promptReplaceArt() {
  if ( !game.user.isGM ) return ui.notifications.warn(loc("Replace.GMOnly"));
  let targets;
  try {
    targets = await collectTargets();
  } catch(err) {
    console.error(`${MODULE_ID} | Failed to load ${MAPPING_PATH}`, err);
    return ui.notifications.error(loc("Replace.LoadError"));
  }
  const { actors, tokens, matchedCount } = targets;
  if ( !actors.length && !tokens.length ) {
    return ui.notifications.info(loc("Replace.NothingToDo", { count: matchedCount }));
  }

  const names = actors.map(({ actor }) => `<li>${foundry.utils.escapeHTML(actor.name)}</li>`).join("");
  const sceneCount = new Set(tokens.map(t => t.scene.id)).size;
  const checkbox = (name, label, checked = true, disabled = false) => `
    <div class="form-group">
      <label>${label}</label>
      <div class="form-fields"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}></div>
    </div>`;
  const content = `
    <p>${loc("Replace.Summary", { actors: actors.length, tokens: tokens.length, scenes: sceneCount })}</p>
    ${checkbox("portraits", loc("Replace.Portraits"), true, !actors.length)}
    ${checkbox("prototypes", loc("Replace.Prototypes"), true, !actors.length)}
    ${checkbox("placed", loc("Replace.Placed", { count: tokens.length }), true, !tokens.length)}
    ${actors.length ? `<details><summary>${loc("Replace.ActorList")}</summary><ul>${names}</ul></details>` : ""}
    <p class="hint">${loc("Replace.Hint")}</p>`;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("Replace.Title"), icon: "fa-solid fa-images" },
    position: { width: 520 },
    content,
    buttons: [
      {
        action: "apply", label: loc("Replace.Apply"), icon: "fa-solid fa-check", default: true,
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "cancel", label: "COMMON.Cancel", icon: "fa-solid fa-xmark" }
    ]
  });
  if ( !choice || (choice === "cancel") ) return;

  const result = await applyArt(targets, {
    portraits: !!choice.portraits, prototypes: !!choice.prototypes, placed: !!choice.placed
  });
  ui.notifications.info(loc("Replace.Done", { actors: result.actorCount, tokens: result.tokenCount }));
}

/* -------------------------------------------- */
/*  Settings menus                              */
/* -------------------------------------------- */

/** Settings menus are instantiated and rendered by SettingsConfig; we run an action instead of rendering. */
class PriorityMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    promptPriority();
    return this;
  }
}

class ReplaceArtMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    promptReplaceArt();
    return this;
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "priorityPrompted", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.registerMenu(MODULE_ID, "priority", {
    name: `${MODULE_ID}.Settings.Priority.Name`,
    label: `${MODULE_ID}.Settings.Priority.Label`,
    hint: `${MODULE_ID}.Settings.Priority.Hint`,
    icon: "fa-solid fa-ranking-star",
    type: PriorityMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "replaceArt", {
    name: `${MODULE_ID}.Settings.Replace.Name`,
    label: `${MODULE_ID}.Settings.Replace.Label`,
    hint: `${MODULE_ID}.Settings.Replace.Hint`,
    icon: "fa-solid fa-images",
    type: ReplaceArtMenu,
    restricted: true
  });
});

Hooks.once("ready", async () => {
  if ( !game.user.isActiveGM ) return;
  if ( game.settings.get(MODULE_ID, "priorityPrompted") ) return;
  await game.settings.set(MODULE_ID, "priorityPrompted", true);
  await promptPriority({ firstRun: true });
});

// Expose the actions for macros.
Hooks.once("setup", () => {
  const module = game.modules.get(MODULE_ID);
  if ( module ) module.api = { promptPriority, promptReplaceArt, setTopPriority, hasTopPriority };
});
