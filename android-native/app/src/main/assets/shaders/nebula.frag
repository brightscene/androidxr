// Nebula drift: floating inside a glowing nebula, layers of coloured gas lit from within.
float n2(vec3 p){ return vnoise(p) * 0.65 + vnoise(p * 2.1) * 0.35; }
vec4 scene(vec3 d){
  vec3 o = vec3(0.0, 0.0, -uTravel * 0.05) + vec3(uTime * 0.01, 0.0, 0.0);
  vec3 acc = vec3(0.0); float trans = 1.0;
  for (int i = 0; i < 10; i++) {
    float t = 0.6 + float(i) * 0.55;
    vec3 p = o + d * t;
    float den = smoothstep(0.42, 0.85, n2(p * 0.9));
    vec3 col = mix(uC1 * 1.5, uC2 * 1.4, n2(p * 1.7 + 5.0)) + vec3(0.9, 0.5, 0.8) * smoothstep(0.75, 0.95, n2(p * 2.3)) * 0.6;
    acc += col * den * trans * 0.22;
    trans *= 1.0 - den * 0.18;
  }
  vec3 c = uC0 * 0.4 + acc * (0.8 + uEnergy * 0.4 + uBreath * 0.15 + uBeat * 0.1);
  c += vec3(starDot(d, 280.0, 0.9958).x) * trans;
  return vec4(grade(c), 1.0);
}
