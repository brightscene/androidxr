import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Space wash
// The washing machine, gone cosmic and calm. Every perforation in the drum is
// an orb of light that breathes on its own, slowly brightening and fading in
// soft teal, blue, violet and rose; aurora light flows along the walls and a
// starfield streams in through the door towards you, while the drum turns
// slowly one way, then the other.
const R = 2.3, FRONT = -3.2, BACK = 2.6, EYE = 1.6;
const PHASES = [['fill', 14], ['wash', 42], ['drain', 8], ['spin', 18], ['slow', 7], ['rest', 5]];
const CYCLE = PHASES.reduce((s, p) => s + p[1], 0);

export class SpaceWashScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uAng: { value: 0 }, uSpin: { value: 0 }, uLevel: { value: -R }, uSlosh: { value: 0 } });
    this.rig = new THREE.Group();
    this.rig.position.y = EYE;
    this.group.add(this.rig);

    // the drum: brushed, perforated steel with three lifting paddles
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BACK - FRONT, 96, 16, true).rotateX(Math.PI / 2).translate(0, 0, (BACK + FRONT) / 2), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: U,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uAng, uSpin, uLevel; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){
          float a = atan(vP.y, vP.x) - uAng;                 // the drum's own angle, turning
          float u = a * ${R.toFixed(2)}, z = vP.z;
          // perforations: little dimpled holes in neat rows, smeared as it spins fast
          vec2 g = vec2(u / 0.16, z / 0.16); vec2 f = fract(g) - 0.5;
          f.x *= 1.0 + uSpin * 6.0;
          float hole = smoothstep(0.17, 0.12, length(f));
          float brushed = 0.9 + 0.1 * vnoise(vec3(u * 40.0, z * 2.0, 1.0));
          // light from the door glows on the steel, brighter toward the front
          float lightF = 0.35 + 0.65 * smoothstep(${BACK.toFixed(1)}, ${FRONT.toFixed(1)}, z);
          float top = 0.6 + 0.4 * smoothstep(-1.0, 1.0, vP.y);
          vec3 c = vec3(0.62, 0.65, 0.7) * brushed * lightF * top;
          // every hole a glowing orb, slowly cycling through colours; streaking into rings in the spin
          vec2 id = floor(g);
          float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 oc = 0.6 + 0.4 * cos(6.28318 * (h * 0.6 + 0.45 + uTime * 0.01 + vec3(0.0, 0.33, 0.67)));   // soft teal, blue, violet and rose
          float orb = smoothstep(0.2, 0.0, length(f)), halo = exp(-dot(f, f) * 18.0);
          c *= 0.22;   // dark steel, so the orbs shine
          // each orb breathes on its own, slowly: rising, resting, fading
          float period = 5.0 + h * 9.0, ph = fract(uTime / period + h * 7.0);
          float breath = pow(0.5 + 0.5 * sin(ph * 6.28318), 2.0);
          c += oc * (orb * 1.4 + halo * 0.3) * (0.12 + 0.88 * breath);
          // aurora light flowing along the walls, towards you
          float flow = fbm(vec3(a * 1.8, z * 0.5 + uTime * 0.35, uTime * 0.05));
          vec3 ac = mix(vec3(0.1, 0.9, 0.55), vec3(0.6, 0.3, 1.0), smoothstep(0.3, 0.8, fbm(vec3(a, z * 0.2, 7.0))));
          c += ac * smoothstep(0.5, 0.85, flow) * 0.45;
          c += vec3(1.0, 0.97, 0.9) * pow(max(0.0, sin(a * 2.0 + 1.0)), 30.0) * 0.25 * lightF;   // a soft sheen
          // the three paddles
          float pd = abs(fract(a / 6.28318 * 3.0) - 0.5);
          c = mix(c, vec3(0.25, 0.27, 0.32) * lightF, smoothstep(0.035, 0.02, pd) * (1.0 - uSpin * 0.6));
          // below the water line the steel looks blue-green and wavers
          float under = smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y);
          c = mix(c, c * vec3(1.2, 0.5, 0.2) + vec3(0.5, 0.12, 0.0), under);   // glowing hot below the lava
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    this.rig.add(drum);
    // the back of the drum: steel with a turning star of ribs
    const back = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uAng, uLevel; varying vec2 vP; ${NOISE} ${GRADE}
        void main(){ float r = length(vP), a = atan(vP.y, vP.x) - uAng;
          float rib = smoothstep(0.06, 0.0, abs(fract(a / 6.28318 * 6.0) - 0.5) - 0.42) * smoothstep(0.3, 0.5, r);
          vec3 c = vec3(0.3, 0.32, 0.35) * (0.8 + 0.2 * vnoise(vec3(vP * 20.0, 2.0))) + vec3(0.12) * rib;
          c += vec3(0.25) * smoothstep(0.3, 0.25, r);
          c = mix(c, c * vec3(1.2, 0.5, 0.2) + vec3(0.4, 0.1, 0.0), smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    back.position.z = BACK; back.rotation.y = Math.PI;
    this.rig.add(back);
    // the door: a rubber seal round thick curved glass, a warm room blurred beyond
    const seal = new THREE.Mesh(new THREE.TorusGeometry(R - 0.15, 0.22, 16, 96), new THREE.MeshBasicMaterial({ color: 0x1e2226 }));
    seal.position.z = FRONT;
    this.rig.add(seal);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 96), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uLevel, uSpin; varying vec2 vP; ${NOISE} ${GRADE}
        void main(){ float r = length(vP) / ${(R - 0.3).toFixed(2)};
          // space outside: stars, a violet nebula, a ringed planet
          vec3 room = mix(vec3(0.01, 0.01, 0.03), vec3(0.18, 0.06, 0.25), smoothstep(0.45, 0.8, fbm(vec3(vP * 1.2, 4.0))));
          vec2 sg = vP * 30.0; float st = fract(sin(dot(floor(sg), vec2(12.9898, 78.233))) * 43758.5453);
          room += vec3(0.9) * step(0.96, st) * smoothstep(0.35, 0.0, length(fract(sg) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + st * 50.0));
          float pr = length(vP - vec2(0.6, 0.55));
          room = mix(room, mix(vec3(0.15, 0.08, 0.2), vec3(0.85, 0.55, 0.4), smoothstep(0.35, -0.2, vP.x - 0.6 + vP.y - 0.55)), step(pr, 0.38));
          room += vec3(0.8, 0.7, 0.6) * smoothstep(0.02, 0.0, abs(length((vP - vec2(0.6, 0.55)) * vec2(1.0, 3.2)) - 0.62)) * step(0.38, pr) * 0.6;
          // the glass bowl: darker and greener at its thick rim, a bright reflection arc
          vec3 c = room * mix(1.0, 0.45, smoothstep(0.6, 1.0, r));
          c += vec3(1.0) * smoothstep(0.02, 0.0, abs(r - 0.78)) * smoothstep(0.2, 0.9, vP.y / ${R.toFixed(1)} + 0.5) * 0.35;
          // lava glowing against the bottom of the glass
          c = mix(c, vec3(1.0, 0.35, 0.05), smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y) * 0.7);
          gl_FragColor = vec4(grade(c), 0.92 * uFade); }`,
    }));
    glass.position.z = FRONT + 0.05;
    this.rig.add(glass);

    // the water: a level surface that rises and drains, sloshing, foamy
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, BACK - FRONT, 60, 60).rotateX(-Math.PI / 2).translate(0, 0, (BACK + FRONT) / 2), new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `uniform float uLevel, uSlosh, uTime; varying vec3 vP; ${NOISE}
        void main(){ vec3 p = position; p.y = uLevel + sin(p.x * 1.5 + uTime * 2.0) * 0.05 * uSlosh + p.x * 0.12 * uSlosh * sin(uTime * 0.8) + (vnoise(vec3(p.xz * 2.0, uTime)) - 0.5) * 0.06;
          vP = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uLevel; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){ if (vP.x * vP.x + vP.y * vP.y > ${(R * R * 0.995).toFixed(3)} || uLevel < -${(R - 0.05).toFixed(2)}) discard;
          // molten lava: a dark crust, cracked with glowing fire that flows and churns
          float n = fbm(vec3(vP.xz * 1.6, uTime * 0.12));
          float cracks = smoothstep(0.08, 0.0, abs(fbm(vec3(vP.xz * 3.0 + n * 1.5, uTime * 0.2)) - 0.5));
          vec3 crust = vec3(0.08, 0.03, 0.02) * (0.7 + 0.6 * n);
          vec3 fire = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.3), pow(cracks, 3.0));
          vec3 c = mix(crust, fire * 1.6, max(cracks, smoothstep(0.62, 0.8, n) * 0.8));
          c += vec3(1.0, 0.5, 0.1) * pow(vnoise(vec3(vP.xz * 6.0, uTime * 1.5)), 10.0) * 0.8;   // bubbles bursting
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    this.suds = particles(U, { count: 700, min: [-1.7, -1.7, FRONT], max: [1.7, 1.7, BACK], vel: [0, 0, 1.6], sway: 0.15, size: [0.008, 0.03], colors: ['#ffffff', '#9affd8', '#c8a8ff', '#8ad8ff'], alpha: 0.85 });   // stars streaming in through the door
    this.rig.add(this.suds);

    // the load: spaceship junk, metal and panels, lit by the lava and the orbs
    const metal = (base, accent, kind) => new THREE.ShaderMaterial({
      uniforms: { ...U, uA: { value: new THREE.Color(base) }, uB: { value: new THREE.Color(accent) }, uK: { value: kind } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uA, uB; uniform float uFade, uK, uLevel; varying vec3 vN; varying vec3 vP; varying vec3 vV; ${NOISE} ${GRADE}
        void main(){ vec3 n = normalize(vN);
          float l = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.0, 0.3, 1.0))), 0.0);
          float spec = pow(max(dot(reflect(-normalize(vV), n), normalize(vec3(0.2, 0.5, 1.0))), 0.0), 24.0);
          vec3 c = uA * (0.8 + 0.3 * vnoise(vP * 25.0)) * l + vec3(1.0, 0.9, 0.8) * spec * 0.6;
          if (uK > 0.5 && uK < 1.5) { vec2 g = fract(vP.xy * vec2(8.0, 5.0)); c = mix(uB * 0.6, uA, step(0.08, min(g.x, g.y))) * l + vec3(0.6, 0.7, 1.0) * spec; }   // solar cells
          else c = mix(c, uB * l, step(0.92, fract(vP.x * 3.0 + vP.y * 0.5)) * 0.8);                                   // hazard stripes and panel seams
          c += vec3(1.0, 0.4, 0.1) * max(0.0, -n.y) * 0.35;   // the lava's glow from below
          gl_FragColor = vec4(grade(c), uFade); }`,
    });
    const junk = [
      [new THREE.BoxGeometry(0.9, 0.06, 0.6), metal('#9aa0a8', '#f2c230', 0)],                        // a hull panel
      [new THREE.BoxGeometry(0.8, 0.04, 0.45), metal('#1a2a5a', '#d8dde6', 1)],                       // a solar panel
      [new THREE.SphereGeometry(0.38, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.35), metal('#d8dce2', '#c0392b', 0)],   // a dish
      [new THREE.CylinderGeometry(0.12, 0.32, 0.55, 24, 1, true), metal('#5a4a40', '#ff7a30', 0)],   // a thruster nozzle
      [new THREE.CapsuleGeometry(0.2, 0.55, 8, 16), metal('#e6e6e6', '#2e86de', 0)],                  // a fuel tank
      [new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), metal('#c8ccd2', '#c8ccd2', 0)],               // an antenna
      [new THREE.BoxGeometry(0.4, 0.4, 0.4), metal('#7a7f88', '#e74c3c', 0)],                         // a cargo box
    ];
    this.clothes = [];   // nothing tumbling: just light

    this.t = 0; this.ang = 0; this.vel = 0; this.dir = 1; this.flip = 8; this.phaseName = '';
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }
  update(dt) {
    const U = this.uniforms;
    // the drum turns slowly, easing one way and then the other
    this.flip -= dt;
    if (this.flip <= 0) { this.dir *= -1; this.flip = 18 + Math.random() * 10; }
    this.vel = damp(this.vel, 0.18 * this.dir, 0.3, dt);
    this.ang += this.vel * dt;
    U.uAng.value = this.ang;
    U.uSpin.value = 0;
    U.uLevel.value = -R - 1;   // empty
  }
}
