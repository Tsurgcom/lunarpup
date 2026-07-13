import { spawnPosition } from "./moon";

/** Module-level local pup pose — map, LOD, remotes read this each frame. */

export type LocalPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** World-space velocity (m/s) — drives velocity-based chunk LOD. */
  vx: number;
  vy: number;
  vz: number;
};

const spawn = spawnPosition();
const pose: LocalPose = {
  x: spawn.x,
  y: spawn.y,
  z: spawn.z,
  yaw: 0,
  vx: 0,
  vy: 0,
  vz: 0,
};

export function setLocalPose(
  x: number,
  y: number,
  z: number,
  yaw: number,
  vx = 0,
  vy = 0,
  vz = 0,
): void {
  pose.x = x;
  pose.y = y;
  pose.z = z;
  pose.yaw = yaw;
  pose.vx = vx;
  pose.vy = vy;
  pose.vz = vz;
}

export function getLocalPose(): LocalPose {
  return pose;
}
