import { Billboard, Html } from "@react-three/drei";
import type { Ref } from "react";

const NAME_Y = 1.35;

type PlayerNameTagProps = {
  name: string;
  /** Optional ref to the label element for imperative text updates. */
  labelRef?: Ref<HTMLDivElement>;
};

/** Camera-facing nameplate above a pup (parent should be position-only). */
export function PlayerNameTag({ name, labelRef }: PlayerNameTagProps) {
  return (
    <Billboard position={[0, NAME_Y, 0]} follow>
      <Html center style={{ pointerEvents: "none" }} zIndexRange={[30, 10]}>
        <div ref={labelRef} className="pup-name">
          {name}
        </div>
      </Html>
    </Billboard>
  );
}
