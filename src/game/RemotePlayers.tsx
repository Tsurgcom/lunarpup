import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SkateDog } from "./SkateDog";
import {
  getPeer,
  getPeerIds,
  subscribeRoster,
} from "./peerStore";

export function RemotePlayers() {
  const peerIds = useSyncExternalStore(
    subscribeRoster,
    getPeerIds,
    getPeerIds,
  );

  return (
    <>
      {peerIds.map((id) => (
        <RemotePup key={id} peerId={id} />
      ))}
    </>
  );
}

function RemotePup({ peerId }: { peerId: string }) {
  const ref = useRef<THREE.Group>(null);
  const [style, setStyle] = useState(() => {
    const snap = getPeer(peerId);
    return {
      fur: snap?.fur ?? "#d4a574",
      accent: snap?.accent ?? "#f0c27a",
    };
  });

  const target = useRef({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    initialized: false,
  });
  const euler = useRef(new THREE.Euler());

  useEffect(() => {
    const snap = getPeer(peerId);
    if (!snap) return;
    setStyle({ fur: snap.fur, accent: snap.accent });
  }, [peerId]);

  useFrame((_, dt) => {
    const snap = getPeer(peerId);
    const g = ref.current;
    if (!snap || !g) return;

    if (snap.fur !== style.fur || snap.accent !== style.accent) {
      setStyle({ fur: snap.fur, accent: snap.accent });
    }

    target.current.pos.set(snap.x, snap.y, snap.z);
    euler.current.set(snap.pitch, snap.yaw, snap.roll, "YXZ");
    target.current.quat.setFromEuler(euler.current);

    if (!target.current.initialized) {
      g.position.copy(target.current.pos);
      g.quaternion.copy(target.current.quat);
      target.current.initialized = true;
      return;
    }

    const alpha = 1 - Math.exp(-14 * dt);
    g.position.lerp(target.current.pos, alpha);
    g.quaternion.slerp(target.current.quat, alpha);
  });

  return <SkateDog ref={ref} fur={style.fur} accent={style.accent} />;
}
