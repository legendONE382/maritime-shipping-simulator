import type { Material } from 'three';

/** Materials that live for the whole session and must survive world rebuilds. */
export const SHARED = new Set<Material>();

export function share<T extends Material>(m: T): T {
  SHARED.add(m);
  return m;
}
