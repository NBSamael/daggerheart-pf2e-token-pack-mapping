# Daggerheart PF2e Token Pack Mapping (NBSamael)

Maps the art from the Pathfinder Tokens module to adversaries in the Daggerheart system from Foundryborne.

This is a fork of [MechaMaya's module](https://github.com/mechamaya/daggerheart-pf2e-token-pack-mapping), published under its own id (`daggerheart-pf2e-token-pack-mapping-nbs`) so it can be installed alongside or instead of the original.

## Installation

In Foundry VTT, go to *Add-on Modules → Install Module* and paste this manifest URL:

```
https://github.com/NBSamael/daggerheart-pf2e-token-pack-mapping/releases/latest/download/module.json
```

## Settings

- **Art priority**: other modules (such as *Daggerheart Core Rulebook*) can also provide art for Daggerheart adversaries. On first activation the module offers to take priority over them; you can also do it later with the *Give this module priority* button, or fine-tune the order in Core settings → *Compendium Art*. Only the 108 adversaries covered by this module are affected; the others keep the art from other modules.
- **Already imported adversaries**: compendium art is only applied when an actor is imported. The *Apply art* button replaces the portraits, prototype tokens and placed tokens of adversaries already in your world (only those imported from the Daggerheart compendium and covered by this module).

Both actions are also available to macros via `game.modules.get("daggerheart-pf2e-token-pack-mapping-nbs").api` (`promptPriority()`, `promptReplaceArt()`).

## Requirements

Requires art from several modules installed on your system:
- [Pathfinder Tokens: Bestiaries](https://foundryvtt.com/packages/pf2e-tokens-bestiaries)
- [Pathfinder Tokens: NPC Core](https://foundryvtt.com/packages/pf2e-tokens-npc-core)
- [Pathfinder Tokens: Myth and Magic](https://foundryvtt.com/packages/pf2e-tokens-myth-and-magic)
- [Pathfinder Tokens: Character Gallery](https://foundryvtt.com/packages/pf2e-tokens-characters)

Modeled after esheyw's [PF2e Community Monster Core Token Pack Mapping](https://github.com/esheyw/pf2e-community-monster-core-token-pack-mapping) module.
