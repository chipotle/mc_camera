import { world, system, BlockPermutation, Player, CatmullRomSpline, EasingType } from "@minecraft/server";

const FLYOVER_DURATION = 20; // fly over for 20 seconds
const INIT_RETRY_TICKS = 40; // retry every two seconds
const MAX_INIT_RETRIES = 15; // try to spawn for about 30 sec

let ticksSinceLoad = 0;
let initRetries = 0;

// -- Startup Tick --
function mainTick() {
  ticksSinceLoad++;

  if (ticksSinceLoad === 100) {
    world.sendMessage("Welcome to the flyover!");
    initialize();
  }

  system.run(mainTick);
}

// -- start the mainTick loop --
system.run(mainTick);

function initialize() {
  const overworld = world.getDimension("overworld");
  const buttonLocation = setButtonLocation();

  if (buttonLocation === undefined) {
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

  // we have the button location, so let's try and spawn it
  const cobblestone = overworld.getBlock(buttonLocation);
  const button = overworld.getBlock({
    x: buttonLocation.x,
    y: buttonLocation.y + 1,
    z: buttonLocation.z,
  });

  if (button === undefined || cobblestone === undefined) {
    if (initRetries < MAX_INIT_RETRIES) {
      initRetries++;
      system.runTimeout(() => initialize(), INIT_RETRY_TICKS);
    } else {
      world.sendMessage("Could not place the switch.");
    }
    return;
  }

  // all systems go!
  cobblestone.setPermutation(BlockPermutation.resolve("cobblestone"));
  button.setPermutation(BlockPermutation.resolve("spruce_button", { facing_direction: 1 }));
  world.afterEvents.buttonPush.subscribe(onButtonPush);

  world.sendMessage(
    "Press the button at X:" + buttonLocation.x + " Y:" + buttonLocation.y + " Z:" + buttonLocation.z + " to start!"
  );
}

function setButtonLocation(): { x: number; y: number; z: number } | undefined {
  const spawnLoc = world.getDefaultSpawnLocation();
  const x = spawnLoc.x - 5;
  const z = spawnLoc.z - 5;
  const y = findTopmostBlock(x, z);
  if (y === undefined) return undefined;
  return { x, y, z };
}

function findTopmostBlock(x: number, z: number): number | undefined {
  const overworld = world.getDimension("overworld");
  const players = world.getPlayers();
  if (players.length === 0) return undefined;
  const startY = Math.floor(Math.max(players[0].location.y, -62));

  // Check if the chunk is loaded at this position
  let block = overworld.getBlock({ x, y: startY, z });
  if (block === undefined) return undefined;

  // if we're in air, go down to find the topmost solid block
  if (block.permutation.matches("minecraft:air")) {
    let y = startY;
    while (y >= -62) {
      block = overworld.getBlock({ x, y, z });
      if (block === undefined) return undefined;
      if (!block.permutation.matches("minecraft:air")) {
        return y + 1; // first air block above ground
      }
      y--;
    }
    return undefined; // no solid ground found
  } else {
    // We're underground; go up to find the first air block
    let y = startY;
    while (y <= 320) {
      block = overworld.getBlock({ x, y, z });
      if (block === undefined) return undefined;
      if (block.permutation.matches("minecraft:air")) {
        return y;
      }
      y++;
    }
    return undefined; // no air found (shouldn't happen)
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

function startFlyover(player: Player) {
  const playerLoc = player.location;
  const flyoverHeight = Math.min(playerLoc.y + 200, 320) - playerLoc.y;

  // build a CatmullRom spline that arcs over the player
  const flyover = new CatmullRomSpline();
  flyover.controlPoints = [
    { x: playerLoc.x, y: playerLoc.y + 1, z: playerLoc.z },
    { x: playerLoc.x - 100, y: playerLoc.y + flyoverHeight * 0.5, z: playerLoc.z - 100 },
    { x: playerLoc.x + 100, y: playerLoc.y + flyoverHeight, z: playerLoc.z - 100 },
    { x: playerLoc.x + 100, y: playerLoc.y + flyoverHeight, z: playerLoc.z + 100 },
    { x: playerLoc.x - 100, y: playerLoc.y + flyoverHeight * 0.66, z: playerLoc.z + 100 },
    { x: playerLoc.x, y: playerLoc.y + 1, z: playerLoc.z },
  ];

  // set camera to free mode
  try {
    player.camera.setCamera("minecraft:free", {
      location: { x: playerLoc.x, y: playerLoc.y + 1, z: playerLoc.z },
      rotation: { x: 0, y: 0 },
    });
  } catch (e) {
    world.sendMessage("Error setting free camera: " + e);
  }

  // play the animation
  system.runTimeout(() => {
    try {
      player.camera.playAnimation(flyover, {
        animation: {
          progressKeyFrames: [
            { timeSeconds: 0, alpha: 0, easingFunc: EasingType.InOutCubic },
            { timeSeconds: FLYOVER_DURATION, alpha: 1, easingFunc: EasingType.InOutCubic },
          ],
          rotationKeyFrames: [
            {
              timeSeconds: 0,
              rotation: { x: -20, y: 180, z: 0 },
              easingFunc: EasingType.InOutSine,
            },
            {
              timeSeconds: FLYOVER_DURATION * 0.5,
              rotation: { x: -55, y: 0, z: 0 },
              easingFunc: EasingType.InOutSine,
            },
            {
              timeSeconds: FLYOVER_DURATION,
              rotation: { x: -20, y: 270, z: 0 },
              easingFunc: EasingType.InOutSine,
            },
          ],
        },
        totalTimeSeconds: FLYOVER_DURATION,
      });
    } catch (e) {
      world.sendMessage("Error playing animation: " + e);
    }
  }, 2); // 2-tick delay for free camera to take effect
  // clear camera after tour
  system.runTimeout(
    () => {
      player.camera.clear();
    },
    FLYOVER_DURATION * 20 + 1
  );
}
