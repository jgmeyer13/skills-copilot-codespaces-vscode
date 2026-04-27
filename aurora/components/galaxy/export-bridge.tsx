"use client";

import { useEffect, type MutableRefObject } from "react";
import { useThree } from "@react-three/fiber";

export type ExportHandle = {
  /** Returns the live WebGL canvas so callers can read its pixels. */
  getCanvas: () => HTMLCanvasElement;
};

type Props = {
  apiRef: MutableRefObject<ExportHandle | null>;
};

/**
 * Mounts inside the R3F <Canvas> tree. Uses useThree() to grab the renderer's
 * canvas DOM element and exposes it to outside code via the apiRef. Doesn't
 * render any geometry.
 */
export function ExportBridge({ apiRef }: Props) {
  const { gl } = useThree();

  useEffect(() => {
    apiRef.current = {
      getCanvas: () => gl.domElement,
    };
    return () => {
      apiRef.current = null;
    };
  }, [gl, apiRef]);

  return null;
}
