// White stars: a night sky of twinkling stars and the Milky Way.
vec4 scene(vec3 d){
  vec3 band = normalize(vec3(0.35, 0.9, 0.25));
  float milky = exp(-pow(dot(d, band) * 4.0, 2.0));
  float dust = fbm(d * 6.0 + vec3(0.0, 0.0, uTime * 0.004));
  vec3 c = vec3(0.012, 0.014, 0.03) + vec3(0.32, 0.30, 0.36) * milky * smoothstep(0.35, 0.85, dust);
  for (int k = 0; k < 3; k++) {
    float sc = 140.0 + float(k) * 110.0;
    vec2 s = starDot(d, sc, 0.985 - float(k) * 0.004 - milky * 0.01);
    float tw = 0.75 + 0.25 * sin(uTime * (1.0 + s.y * 3.0) + s.y * 40.0);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.78), s.y);
    c += tint * s.x * tw * (1.2 - float(k) * 0.3);
  }
  // soft curtains of coloured aura light overhead
  float h = d.y;
  float curtain = smoothstep(0.05, 0.45, h) * smoothstep(0.95, 0.5, h);
  float waves = fbm(vec3(atan(d.z, d.x) * 2.0, h * 1.5 - uTime * 0.03, uTime * 0.02));
  float rays = 0.5 + 0.5 * sin(atan(d.z, d.x) * 14.0 + waves * 6.0 + uTime * 0.15);
  vec3 aura = mix(vec3(0.15, 0.85, 0.6), vec3(0.55, 0.3, 0.9), smoothstep(0.2, 0.8, h + waves * 0.3));
  c += aura * curtain * smoothstep(0.45, 0.8, waves) * (0.35 + 0.4 * rays) * 0.9;
  return vec4(grade(c), 1.0);
}
