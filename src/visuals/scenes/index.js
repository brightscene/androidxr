import { BaseScene } from '../common.js';
import { GalaxyScene } from './galaxy.js';
import { OceanScene } from './ocean.js';
import { OrbScene } from './orb.js';
import { AuroraScene } from './aurora.js';
import { GeometryScene } from './geometry.js';
import { MandalaScene } from './mandala.js';
import { CymaticsScene } from './cymatics.js';
import { MeadowScene, BeachScene, UnderwaterScene, ZenGardenScene, GlowForestScene, SnowPeaksScene, DesertNightScene } from './nature.js';
import { LanternLakeScene, RainLakeScene, CloudFlightScene, LotusPondScene, BambooGroveScene } from './skywater.js';
import { AffirmationScene } from './affirm.js';
import { ImageCycleScene } from './imagecycle.js';
import { TimePortalScene, KaleidosphereScene, NebulaFlightScene, WarpGateScene, MandalaBloomScene, SilkVortexScene } from './dimensions.js';
import { MoonViewScene, FractalTunnelScene, CrystalCaveScene, NebulaScene, LightRibbonsScene, BlackHoleScene, ChakraScene } from './cosmic.js';

// world: what the shared space environment shows behind the scene
//   full  = nebula sky, stars, voyage star field   stars = quiet starry sky only
//   bare  = nothing (the scene draws its own world) off = nothing at all
// cruise: drift speed through space (m/s); nebula: projected nebula brightness
export const SCENES = {
  galaxy: { type: GalaxyScene, label: 'Galaxy voyage', group: 'Space', cruise: 1.2, nebula: 1, world: 'full' },
  moon: { type: MoonViewScene, label: 'Moon view', group: 'Space', cruise: 0, nebula: 0, world: 'bare' },
  blackhole: { type: BlackHoleScene, label: 'Black hole', group: 'Space', cruise: 0.3, nebula: 0.3, world: 'stars' },
  nebula: { type: NebulaScene, label: 'Nebula drift', group: 'Space', cruise: 1.5, nebula: 0, world: 'bare' },
  ribbons: { type: LightRibbonsScene, label: 'Light ribbons', group: 'Space', cruise: 0.2, nebula: 0.7, world: 'full' },
  aurora: { type: AuroraScene, label: 'Aurora', group: 'Space', cruise: 0.3, nebula: 0.5, world: 'full' },

  affirm: { type: AffirmationScene, label: 'Affirmation field', group: 'Dimensions', cruise: 2.2, nebula: 0.75, world: 'full' },
  cycle: { type: ImageCycleScene, label: 'Image cycling', group: 'Dimensions', cruise: 0.2, nebula: 0.75, world: 'full' },
  portal: { type: TimePortalScene, label: 'Time portal', group: 'Dimensions', cruise: 4, nebula: 0, world: 'bare' },
  kaleido: { type: KaleidosphereScene, label: 'Kaleidosphere', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  tunnel: { type: FractalTunnelScene, label: 'Fractal tunnel', group: 'Dimensions', cruise: 2.5, nebula: 0, world: 'bare' },
  nebulaflight: { type: NebulaFlightScene, label: 'Nebula flight', group: 'Dimensions', cruise: 3, nebula: 0, world: 'bare' },
  warp: { type: WarpGateScene, label: 'Warp gate', group: 'Dimensions', cruise: 9, nebula: 0, world: 'bare' },
  bloom: { type: MandalaBloomScene, label: 'Mandala bloom', group: 'Dimensions', cruise: 2, nebula: 0, world: 'bare' },
  silk: { type: SilkVortexScene, label: 'Silk vortex', group: 'Dimensions', cruise: 4, nebula: 0, world: 'stars' },

  meadow: { type: MeadowScene, label: 'Meadow', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  beach: { type: BeachScene, label: 'White beach', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  underwater: { type: UnderwaterScene, label: 'Underwater', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  zen: { type: ZenGardenScene, label: 'Zen garden', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  forest: { type: GlowForestScene, label: 'Glowing forest', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  bamboo: { type: BambooGroveScene, label: 'Bamboo grove', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  snow: { type: SnowPeaksScene, label: 'Snowy peaks', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  desert: { type: DesertNightScene, label: 'Desert night', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },

  clouds: { type: CloudFlightScene, label: 'Cloud flight', group: 'Sky & water', cruise: 7, nebula: 0, world: 'bare' },
  lanterns: { type: LanternLakeScene, label: 'Lantern lake', group: 'Sky & water', cruise: 0, nebula: 0, world: 'bare' },
  rain: { type: RainLakeScene, label: 'Rain on the lake', group: 'Sky & water', cruise: 0, nebula: 0, world: 'bare' },
  lotus: { type: LotusPondScene, label: 'Lotus pond', group: 'Sky & water', cruise: 0, nebula: 0, world: 'bare' },
  ocean: { type: OceanScene, label: 'Light ocean', group: 'Sky & water', cruise: 0.25, nebula: 0.55, world: 'full' },


  crystal: { type: CrystalCaveScene, label: 'Crystal cave', group: 'Mind', cruise: 0, nebula: 0, world: 'bare' },
  chakras: { type: ChakraScene, label: 'Chakras', group: 'Mind', cruise: 0.15, nebula: 0.6, world: 'full' },
  orb: { type: OrbScene, label: 'Breathing orb', group: 'Mind', cruise: 0.5, nebula: 0.8, world: 'full' },
  mandala: { type: MandalaScene, label: 'Lotus mandala', group: 'Mind', cruise: 0.4, nebula: 0.7, world: 'full' },
  geometry: { type: GeometryScene, label: 'Sacred geometry', group: 'Mind', cruise: 0.45, nebula: 0.7, world: 'full' },
  cymatics: { type: CymaticsScene, label: 'Cymatics', group: 'Mind', cruise: 0.4, nebula: 0.7, world: 'full' },

  stars: { type: BaseScene, label: 'Stars only', group: 'Simple', cruise: 0, nebula: 0, world: 'stars' },
  off: { type: BaseScene, label: 'Off (black)', group: 'Simple', cruise: 0, nebula: 0, world: 'off' },
};

export const BACKGROUNDS = [['auto', 'Auto (per track)'], ...Object.entries(SCENES).map(([k, v]) => [k, v.label])];
