import { IFRAME_ORIGIN } from './constants'
import { offsetRect, roundRect } from './geometry'
import type { BridgeTarget, WorldTarget } from '../types/vibe'

/** L1 的 iframe-viewport 坐标 → 画布世界坐标。 */
export function toWorldTarget(target: BridgeTarget): WorldTarget {
  return {
    ...target,
    rect: roundRect(
      offsetRect(target.rect, IFRAME_ORIGIN.x, IFRAME_ORIGIN.y),
    ),
    coordinateSpace: 'world',
  }
}
