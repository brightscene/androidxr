import * as THREE from 'three';
import { BaseScene, NOISE } from '../common.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Clear mind
// Almost nothing to see: a deep, still dark with the faintest drifting colour,
// so the light frames (drawn by the light layer, see App._mindFlash) are all there is.
// A gentle prompt to close your eyes fades after the first moments.
export class MindFlashScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE}
        void main(){ vec3 d = normalize(vDir);
          float n = fbm(d * 1.6 + vec3(0.0, uTime * 0.01, 0.0));
          vec3 c = mix(vec3(0.004, 0.008, 0.01), vec3(0.01, 0.03, 0.03), n);
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    })), { renderOrder: -10 }));
    this.prompt = textPlane(U, 1.6, 0.12);
    this.prompt.position.set(0, 1.6, -2.4);
    this.prompt.userData.set('Close your eyes and gaze softly through the light');
    this.group.add(this.prompt);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.prompt.material.uniforms.uA.value = Math.min(1, this.t / 2) * Math.max(0, 1 - (this.t - 10) / 4) * 0.7;
  }
}
