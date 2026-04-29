// scripts/main.ts
import { world, system, BlockPermutation, CatmullRomSpline, EasingType } from "@minecraft/server";
var FLYOVER_DURATION = 10;
var INIT_RETRY_TICKS = 40;
var MAX_INIT_RETRIES = 15;
var ticksSinceLoad = 0;
var initRetries = 0;
function mainTick() {
  ticksSinceLoad++;
  if (ticksSinceLoad === 100) {
    world.sendMessage("Welcome to the flyover!");
    initialize();
  }
  system.run(mainTick);
}
system.run(mainTick);
function initialize() {
  const overworld = world.getDimension("overworld");
  const buttonLocation = setButtonLocation();
  if (buttonLocation === void 0) {
    if (initRetries < MAX_INIT_RETRIES) {
      initRetries++;
      world.sendMessage(
        "Waiting for chunks to load near spawn (attempt " + initRetries + " of " + MAX_INIT_RETRIES + ")"
      );
      system.runTimeout(() => initialize(), INIT_RETRY_TICKS);
    } else {
      world.sendMessage("Could not find a valid location for the button. Try moving closer to spawn and /reload!");
    }
    return;
  }
  const cobblestone = overworld.getBlock(buttonLocation);
  const button = overworld.getBlock({
    x: buttonLocation.x,
    y: buttonLocation.y + 1,
    z: buttonLocation.z
  });
  if (button === void 0 || cobblestone === void 0) {
    if (initRetries < MAX_INIT_RETRIES) {
      initRetries++;
      system.runTimeout(() => initialize(), INIT_RETRY_TICKS);
    } else {
      world.sendMessage("Could not place the switch.");
    }
    return;
  }
  cobblestone.setPermutation(BlockPermutation.resolve("cobblestone"));
  button.setPermutation(BlockPermutation.resolve("spruce_button", { facing_direction: 1 }));
  world.afterEvents.buttonPush.subscribe(onButtonPush);
  world.sendMessage(
    "Press the button at X:" + buttonLocation.x + " Y:" + buttonLocation.y + " Z:" + buttonLocation.z + " to start!"
  );
}
function setButtonLocation() {
  const spawnLoc = world.getDefaultSpawnLocation();
  const x = spawnLoc.x - 5;
  const z = spawnLoc.z - 5;
  const y = findTopmostBlock(x, z);
  if (y === void 0) return void 0;
  return { x, y, z };
}
function findTopmostBlock(x, z) {
  const overworld = world.getDimension("overworld");
  const players = world.getPlayers();
  if (players.length === 0) return void 0;
  const startY = Math.floor(Math.max(players[0].location.y, -62));
  let block = overworld.getBlock({ x, y: startY, z });
  if (block === void 0) return void 0;
  if (block.permutation.matches("minecraft:air")) {
    let y = startY;
    while (y >= -62) {
      block = overworld.getBlock({ x, y, z });
      if (block === void 0) return void 0;
      if (!block.permutation.matches("minecraft:air")) {
        return y + 1;
      }
      y--;
    }
    return void 0;
  } else {
    let y = startY;
    while (y <= 320) {
      block = overworld.getBlock({ x, y, z });
      if (block === void 0) return void 0;
      if (block.permutation.matches("minecraft:air")) {
        return y;
      }
      y++;
    }
    return void 0;
  }
}
function onButtonPush() {
  system.run(() => {
    const players = world.getPlayers();
    for (const player of players) {
      startFlyover(player);
    }
  });
}
function startFlyover(player) {
  const playerLoc = player.location;
  const flyoverHeight = Math.min(playerLoc.y + 60, 320) - playerLoc.y;
  const flyover = new CatmullRomSpline();
  flyover.controlPoints = [
    { x: playerLoc.x - 50, y: playerLoc.y + flyoverHeight * 0.5, z: playerLoc.z - 50 },
    { x: playerLoc.x + 50, y: playerLoc.y + flyoverHeight, z: playerLoc.z - 50 },
    { x: playerLoc.x + 50, y: playerLoc.y + flyoverHeight, z: playerLoc.z + 50 },
    { x: playerLoc.x - 50, y: playerLoc.y + flyoverHeight * 0.66, z: playerLoc.z + 50 },
    { x: playerLoc.x, y: playerLoc.y + flyoverHeight * 0.33, z: playerLoc.z }
  ];
  try {
    player.camera.setCamera("minecraft:free", {
      location: { x: playerLoc.x, y: playerLoc.y + flyoverHeight * 0.33, z: playerLoc.z },
      rotation: { x: -30, y: 0 }
    });
  } catch (e) {
    world.sendMessage("Error setting free camera: " + e);
  }
  system.runTimeout(() => {
    try {
      player.camera.playAnimation(flyover, {
        animation: {
          progressKeyFrames: [
            { timeSeconds: 0, alpha: 0, easingFunc: EasingType.InOutCubic },
            { timeSeconds: FLYOVER_DURATION, alpha: 1, easingFunc: EasingType.InOutCubic }
          ],
          rotationKeyFrames: [
            {
              timeSeconds: 0,
              rotation: { x: 0, y: 180, z: 0 },
              easingFunc: EasingType.InOutSine
            },
            {
              timeSeconds: FLYOVER_DURATION * 0.5,
              rotation: { x: 45, y: 0, z: 0 },
              easingFunc: EasingType.InOutSine
            },
            {
              timeSeconds: FLYOVER_DURATION,
              rotation: { x: 0, y: 270, z: 0 },
              easingFunc: EasingType.InOutSine
            }
          ]
        },
        totalTimeSeconds: FLYOVER_DURATION
      });
    } catch (e) {
      world.sendMessage("Error playing animation: " + e);
    }
  }, 2);
}

//# sourceMappingURL=../debug/main.js.map
