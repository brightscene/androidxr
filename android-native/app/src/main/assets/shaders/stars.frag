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
  return vec4(grade(c), 1.0);
}
