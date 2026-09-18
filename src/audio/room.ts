// One short room for every instrument. Dry stays dominant so perpetual
// sixteenths don't smear; the existing smplr Dattorro is tuned darker and
// briefer. No second room, no pedal wash.

export const ROOM = {
  /** Send mix into the global room (8–15%). */
  wet: 0.11,
  /** Dattorro decay ≈ 0.8–1.5 s RT60 with the tank delays smplr ships. */
  decay: 0.4,
  /** High-frequency absorption in the tank (default is ~0 — bright and splashy). */
  damping: 0.48,
  /** Input bandwidth; lower = darker wet (default is ~1). */
  bandwidth: 0.52,
} as const

export interface RoomReverb {
  getParam(name: 'preDelay' | 'bandwidth' | 'inputDiffusion1' | 'inputDiffusion2' | 'decay' | 'decayDiffusion1' | 'decayDiffusion2' | 'damping' | 'excursionRate' | 'excursionDepth' | 'wet' | 'dry'): { value: number } | undefined
}

export function tuneRoom(reverb: RoomReverb): void {
  const set = (name: Parameters<RoomReverb['getParam']>[0], value: number) => {
    const param = reverb.getParam(name)
    if (param) param.value = value
  }
  set('decay', ROOM.decay)
  set('damping', ROOM.damping)
  set('bandwidth', ROOM.bandwidth)
  // Send-effect: the node itself is fully wet; the channel mix is ROOM.wet.
  set('wet', 1)
  set('dry', 0)
}
