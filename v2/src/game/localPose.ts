/** Module-level local pup pose — map + remotes read this each frame. */

export type LocalPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

const pose: LocalPose = { x: 0, y: 8.4, z: 70, yaw: 0 };

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
