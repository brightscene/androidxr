import { BaseScene } from '../common.js';
import { GalaxyScene } from './galaxy.js';
import { OceanScene } from './ocean.js';
import { OrbScene } from './orb.js';
import { AuroraScene, NorthernLightsScene } from './aurora.js';
import { GeometryScene } from './geometry.js';
import { MandalaScene } from './mandala.js';
import { CymaticsScene } from './cymatics.js';
import { MeadowScene, BeachScene, UnderwaterScene, ZenGardenScene, GlowForestScene, SnowPeaksScene, DesertNightScene } from './nature.js';
import { LanternLakeScene, RainLakeScene, CloudFlightScene } from './skywater.js';
import { AffirmationScene } from './affirm.js';
import { ImageCycleScene } from './imagecycle.js';
import { LabyrinthScene } from './labyrinth.js';
import { ReikiScene, AffirmationTraceScene } from './reiki.js';
import { SingingBowlsScene, CrystalBowlsScene } from './bowls.js';
import { WindChimesScene, WoodenChimesScene } from './chimes.js';
import { HandbellsScene, ChurchBellsScene } from './bells.js';
import { HandpanScene, SteelDrumsScene } from './pans.js';
import { CymaticPlateScene } from './cymaticplate.js';
import { AuroraResonanceScene } from './auroraharp.js';
import { ThereminScene } from './theremin.js';
import { WaterfallScene } from './waterfall.js';
import { MindFlashScene } from './mindflash.js';
import { MonksScene } from './monks.js';
import { StarGateScene, WormholeScene } from './stargate.js';
import { MurmurationScene, FireplaceScene, CampfireScene } from './cozy.js';
import { QuantumScene } from './quantum.js';
import { WombScene } from './womb.js';
import { HopeScene, BlissScene } from './hope.js';
import { EarthJourneyScene } from './earth.js';
import { JetSkiScene } from './jetski.js';
import { NeonCityScene } from './neon.js';
import { HeartJourneyScene } from './heart.js';
import { IntoTheLightScene } from './light.js';
import { DroneShowScene } from './drones.js';
import { SkiScene } from './ski.js';
import { RainbowRoadScene } from './rainbow.js';
import { SleepScene } from './sleep.js';
import { StarsScene } from './stars.js';
import { FinalFrontierScene } from './frontier.js';
import { FireworksScene } from './fireworks.js';
import { WasherScene } from './washer.js';
import { DrumJourneyScene, IllusionScene, MindsEyeScene } from './lighttracks.js';
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
  monks: { type: MonksScene, label: 'Tibetan monks', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  mindflash: { type: MindFlashScene, label: 'Clear mind', group: 'Light journeys', premium: true, cruise: 0, nebula: 0, world: 'off' },
  waterfall: { type: WaterfallScene, label: 'Space waterfall', group: 'Space', cruise: 0, nebula: 0, world: 'off' },
  northernlights: { type: NorthernLightsScene, label: 'Northern lights', group: 'Sky & water', cruise: 0, nebula: 0, world: 'off' },

  affirm: { type: AffirmationScene, label: 'Affirmation field', group: 'Dimensions', premium: true, cruise: 2.2, nebula: 0.75, world: 'full' },
  cycle: { type: ImageCycleScene, label: 'Image cycling', group: 'Dimensions', premium: true, cruise: 0.2, nebula: 0.75, world: 'full' },
  quantum: { type: QuantumScene, label: 'Quantum field', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  stargate: { type: StarGateScene, label: 'Wormhole', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  intothelight: { type: IntoTheLightScene, label: 'Into the light', group: 'Mind', cruise: 0, nebula: 0, world: 'off' },
  heartjourney: { type: HeartJourneyScene, label: 'Journey into the heart', group: 'Mind', cruise: 0, nebula: 0, world: 'off' },
  sleep: { type: SleepScene, label: 'Sleep', group: 'Mind', cruise: 0, nebula: 0, world: 'off' },
  hope: { type: HopeScene, label: 'Hope', group: 'Mind', cruise: 0, nebula: 0, world: 'off' },
  bliss: { type: BlissScene, label: 'Bliss', group: 'Mind', cruise: 0, nebula: 0, world: 'off' },
  frontier: { type: FinalFrontierScene, label: 'Final frontier', group: 'Space', cruise: 0, nebula: 0, world: 'off' },
  rainbow: { type: RainbowRoadScene, label: 'Rainbow road', group: 'Space', cruise: 0, nebula: 0, world: 'off' },
  puffroad: { type: class extends RainbowRoadScene { constructor() { super({ puff: true }); } }, label: 'Sweetie road', group: 'Space', cruise: 0, nebula: 0, world: 'off' },
  neoncity: { type: NeonCityScene, label: 'Neon Tokyo flight', group: 'Dimensions', cruise: 0, nebula: 0, world: 'off' },
  washer: { type: WasherScene, label: 'Inside the washing machine', group: 'Dimensions', cruise: 0, nebula: 0, world: 'off' },
  fireworks: { type: FireworksScene, label: 'Fireworks', group: 'Sky & water', cruise: 0, nebula: 0, world: 'off' },
  drones: { type: DroneShowScene, label: 'Drone light show', group: 'Sky & water', cruise: 0, nebula: 0, world: 'off' },
  ski: { type: SkiScene, label: 'Ski run in the snow', group: 'Nature', cruise: 0, nebula: 0, world: 'off' },
  jetski: { type: JetSkiScene, label: 'Jet ski', group: 'Sky & water', cruise: 0, nebula: 0, world: 'off' },
  earthcore: { type: EarthJourneyScene, label: 'Journey to the centre of the earth', group: 'Dimensions', cruise: 0, nebula: 0, world: 'off' },
  wormviolet: { type: class extends WormholeScene { constructor() { super('violet'); } }, label: 'Wormhole · violet drift', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  wormemerald: { type: class extends WormholeScene { constructor() { super('emerald'); } }, label: 'Wormhole · emerald curves', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  wormgold: { type: class extends WormholeScene { constructor() { super('gold'); } }, label: 'Wormhole · golden twister', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  wormcrimson: { type: class extends WormholeScene { constructor() { super('crimson'); } }, label: 'Wormhole · crimson', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  labyrinth: { type: LabyrinthScene, label: 'Space labyrinth', group: 'Dimensions', cruise: 0, nebula: 0, world: 'stars' },
  portal: { type: TimePortalScene, label: 'Time portal', group: 'Dimensions', cruise: 4, nebula: 0, world: 'bare' },
  kaleido: { type: KaleidosphereScene, label: 'Kaleidosphere', group: 'Dimensions', cruise: 0, nebula: 0, world: 'bare' },
  tunnel: { type: FractalTunnelScene, label: 'Fractal tunnel', group: 'Dimensions', cruise: 2.5, nebula: 0, world: 'bare' },
  nebulaflight: { type: NebulaFlightScene, label: 'Nebula flight', group: 'Dimensions', cruise: 3, nebula: 0, world: 'bare' },
  warp: { type: WarpGateScene, label: 'Warp gate', group: 'Dimensions', cruise: 9, nebula: 0, world: 'bare' },
  bloom: { type: MandalaBloomScene, label: 'Mandala bloom', group: 'Dimensions', cruise: 2, nebula: 0, world: 'bare' },
  silk: { type: SilkVortexScene, label: 'Silk vortex', group: 'Dimensions', cruise: 4, nebula: 0, world: 'stars' },

  murmuration: { type: MurmurationScene, label: 'Starling murmuration', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  murmurblack: { type: class extends MurmurationScene { constructor() { super(true); } }, label: 'Starlings at sunset', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  campfire: { type: CampfireScene, label: 'Campfire under the stars', group: 'Nature', cruise: 0, nebula: 0, world: 'off' },
  fireplace: { type: FireplaceScene, label: 'Fireplace', group: 'Nature', cruise: 0, nebula: 0, world: 'off' },
  meadow: { type: MeadowScene, label: 'Meadow', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  beach: { type: BeachScene, label: 'White beach', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  underwater: { type: UnderwaterScene, label: 'Underwater', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  forest: { type: GlowForestScene, label: 'Glowing forest', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  snow: { type: SnowPeaksScene, label: 'Snowy peaks', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },
  desert: { type: DesertNightScene, label: 'Desert night', group: 'Nature', cruise: 0, nebula: 0, world: 'bare' },

  clouds: { type: CloudFlightScene, label: 'Cloud flight', group: 'Sky & water', cruise: 7, nebula: 0, world: 'bare' },
  lanterns: { type: LanternLakeScene, label: 'Lantern lake', group: 'Sky & water', cruise: 0, nebula: 0, world: 'bare' },
  rain: { type: RainLakeScene, label: 'Rain on the lake', group: 'Sky & water', cruise: 0, nebula: 0, world: 'bare' },
  ocean: { type: OceanScene, label: 'Light ocean', group: 'Sky & water', cruise: 0.25, nebula: 0.55, world: 'full' },


  crystal: { type: CrystalCaveScene, label: 'Crystal cave', group: 'Mind', cruise: 0, nebula: 0, world: 'bare' },
  chakras: { type: ChakraScene, label: 'Chakras', group: 'Mind', cruise: 0.15, nebula: 0.6, world: 'full' },
  drums: { type: DrumJourneyScene, label: 'Drum circle', group: 'Light journeys', cruise: 0, nebula: 0, world: 'bare' },
  illusions: { type: IllusionScene, label: 'Audio illusions', group: 'Light journeys', cruise: 0, nebula: 0, world: 'bare' },
  mindseye: { type: MindsEyeScene, label: "Mind's eye", group: 'Light journeys', cruise: 0.6, nebula: 0, world: 'bare' },
  womb: { type: WombScene, label: 'Womb', group: 'Mind', own: true, cruise: 0, nebula: 0, world: 'off' },
  reiki: { type: ReikiScene, label: 'Reiki symbols', group: 'Mind', own: true, cruise: 0, nebula: 0, world: 'bare' },
  metalchimes: { type: WindChimesScene, label: 'Metal wind chimes', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  woodchimes: { type: WoodenChimesScene, label: 'Wooden wind chimes', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  tibetanbowls: { type: SingingBowlsScene, label: 'Tibetan singing bowls', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  crystalbowls: { type: CrystalBowlsScene, label: 'Crystal singing bowls', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  handbells: { type: HandbellsScene, label: 'Handbells', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  churchbells: { type: ChurchBellsScene, label: 'Church bells', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  handpan: { type: HandpanScene, label: 'Handpan', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  steeldrums: { type: SteelDrumsScene, label: 'Space steel drums', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  cymaticplate: { type: CymaticPlateScene, label: 'Cymatics instrument', group: 'Mind', premium: true, cruise: 0.4, nebula: 0.7, world: 'full' },
  auroraharp: { type: AuroraResonanceScene, label: 'Aurora resonance', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  theremin: { type: ThereminScene, label: 'Theremin', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'off' },
  affirmtrace: { type: AffirmationTraceScene, label: 'Affirmation tracing', group: 'Mind', premium: true, cruise: 0, nebula: 0, world: 'bare' },
  orb: { type: OrbScene, label: 'Breathing orb', group: 'Mind', cruise: 0.5, nebula: 0.8, world: 'full' },
  mandala: { type: MandalaScene, label: 'Lotus mandala', group: 'Mind', cruise: 0.4, nebula: 0.7, world: 'full' },
  geometry: { type: GeometryScene, label: 'Sacred geometry', group: 'Mind', cruise: 0.45, nebula: 0.7, world: 'full' },
  cymatics: { type: CymaticsScene, label: 'Cymatics', group: 'Mind', cruise: 0.4, nebula: 0.7, world: 'full' },

  stars: { type: StarsScene, label: 'White stars', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  bluestars: { type: class extends StarsScene { constructor() { super({ blue: true }); } }, label: 'Blue stars', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  starsaura: { type: class extends StarsScene { constructor() { super({ aura: true }); } }, label: 'White stars with aura', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  bluestarsaura: { type: class extends StarsScene { constructor() { super({ blue: true, aura: true }); } }, label: 'Blue stars with aura', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  greenstarsaura: { type: class extends StarsScene { constructor() { super({ green: true, aura: true, auraColours: 'green' }); } }, label: 'Green stars with aura', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  neonstarsaura: { type: class extends StarsScene { constructor() { super({ neon: true, aura: true, auraColours: 'amber' }); } }, label: 'Neon stars with amber aura', group: 'Simple', journey: true, cruise: 0, nebula: 0, world: 'off' },
  off: { type: BaseScene, label: 'Off (black)', group: 'Simple', cruise: 0, nebula: 0, world: 'off' },
};

export const BACKGROUNDS = [['auto', 'Auto (per track)'], ...Object.entries(SCENES).filter(([, v]) => !v.hidden && !v.premium && !v.journey).map(([k, v]) => [k, v.label])];
