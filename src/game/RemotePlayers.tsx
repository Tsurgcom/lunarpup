import { useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { PlayerNameTag } from "./PlayerNameTag";
import { getPeer, getPeerIds, subscribeRoster } from "./peerStore";
import { applySkateDogStyle, SkateDog } from "./SkateDog";

type PupEntry = {
  group: THREE.Group | null;
  nameAnchor: THREE.Group | null;
  nameLabel: HTMLDivElement | null;
  name: string;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  euler: THREE.Euler;
  initialized: boolean;
  fur: string;
  accent: string;
  ghost: boolean;
};

function ensureEntry(peerId: string, entries: Map<string, PupEntry>): PupEntry {
  let entry = entries.get(peerId);
  if (entry) return entry;
  const snap = getPeer(peerId);
  entry = {
    group: null,
    nameAnchor: null,
    nameLabel: null,
    name: snap?.name ?? peerId.slice(0, 6),
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    initialized: false,
    fur: snap?.fur ?? "#d4a574",
    accent: snap?.accent ?? "#f0c27a",
    ghost: Boolean(snap?.ghost),
  };
  entries.set(peerId, entry);
  return entry;
}

/**
 * Remote pups — one useFrame for the whole roster (R3F pitfalls: mutate, don't
 * setState; batch subscriptions). Style changes apply imperatively.
 */
export function RemotePlayers() {
  const peerIds = useSyncExternalStore(subscribeRoster, getPeerIds, getPeerIds);
  const entries = useRef(new Map<string, PupEntry>());
  const alive = useRef(new Set<string>());

  useFrame((_, dt) => {
    const map = entries.current;
    const live = alive.current;
    live.clear();
    for (const id of peerIds) live.add(id);
    for (const id of map.keys()) {
      if (!live.has(id)) map.delete(id);
    }

    const alpha = 1 - Math.exp(-14 * dt);
    for (const peerId of peerIds) {
      const entry = map.get(peerId);
      const g = entry?.group;
      const snap = getPeer(peerId);
      if (!entry || !g || !snap) continue;

      const ghost = Boolean(snap.ghost);
      if (
        snap.fur !== entry.fur ||
        snap.accent !== entry.accent ||
        ghost !== entry.ghost
      ) {
        entry.fur = snap.fur;
        entry.accent = snap.accent;
        entry.ghost = ghost;
        applySkateDogStyle(g, snap.fur, snap.accent, ghost);
      }

      if (snap.name !== entry.name) {
        entry.name = snap.name;
        if (entry.nameLabel) entry.nameLabel.textContent = snap.name;
      }

      entry.pos.set(snap.x, snap.y, snap.z);
      entry.euler.set(snap.pitch, snap.yaw, snap.roll, "YXZ");
      entry.quat.setFromEuler(entry.euler);

      if (!entry.initialized) {
        g.position.copy(entry.pos);
        g.quaternion.copy(entry.quat);
        if (entry.nameAnchor) entry.nameAnchor.position.copy(entry.pos);
        entry.initialized = true;
        continue;
      }

      // Far jump (teleport) — snap instead of lerping through the moon.
      if (g.position.distanceToSquared(entry.pos) > 40 * 40) {
        g.position.copy(entry.pos);
        g.quaternion.copy(entry.quat);
        if (entry.nameAnchor) entry.nameAnchor.position.copy(entry.pos);
        continue;
      }

      g.position.lerp(entry.pos, alpha);
      g.quaternion.slerp(entry.quat, alpha);
      if (entry.nameAnchor) entry.nameAnchor.position.copy(g.position);
    }
  });

  return (
    <>
      {peerIds.map((id) => (
        <RemotePupMount key={id} peerId={id} entries={entries.current} />
      ))}
    </>
  );
}

function RemotePupMount({
  peerId,
  entries,
}: {
  peerId: string;
  entries: Map<string, PupEntry>;
}) {
  // Mount-only style props — mid-session changes go through applySkateDogStyle.
  const initial = useRef<PupEntry | null>(null);
  if (!initial.current) initial.current = ensureEntry(peerId, entries);
  const { fur, accent, ghost, name } = initial.current;

  return (
    <>
      <SkateDog
        ref={(node) => {
          const entry = ensureEntry(peerId, entries);
          entry.group = node;
          if (!node) entry.initialized = false;
        }}
        fur={fur}
        accent={accent}
        ghost={ghost}
        frustumCulled
      />
      <group
        ref={(node) => {
          const entry = ensureEntry(peerId, entries);
          entry.nameAnchor = node;
        }}
      >
        <PlayerNameTag
          name={name}
          labelRef={(el) => {
            const entry = ensureEntry(peerId, entries);
            entry.nameLabel = el;
          }}
        />
      </group>
    </>
  );
}
