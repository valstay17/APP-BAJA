export type Vec3 = [number, number, number];

// SAE J670 convention (vehicle body axes):
// X: forward, Y: right, Z: down
//
// These mappings assume the current model world basis is:
// X: right, Y: up, Z: forward.
// If your model uses a different orientation, adjust the mapping here only.
export function worldToSae(world: Vec3): Vec3 {
  const [wx, wy, wz] = world;
  return [wz, wx, -wy];
}

export function saeToWorld(sae: Vec3): Vec3 {
  const [sx, sy, sz] = sae;
  return [sy, -sz, sx];
}