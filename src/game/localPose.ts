import { spawnPosition } from "./moon";

/** Module-level local pup pose — map + remotes read this each frame. */

export type LocalPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

const spawn = spawnPosition();
const pose: LocalPose = {
  x: spawn.x,
  y: spawn.y,
  z: spawn.z,
  yaw: 0,
};

export function setLocalPose(
  x: number,
  y: number,
  z: number,
  yaw: number,
): void {
  pose.x = x;
  pose.y = y;
  pose.z = z;
  pose.yaw = yaw;
}

export function getLocalPose(): LocalPose {
  return pose;
}
