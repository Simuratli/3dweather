// Durum pikseli: (enlem, boylam, kalan ömür, toplam ömür)

const windGlsl = /* glsl */ `
  #define DEG 0.017453292519943295

  uniform sampler2D uWind;
  uniform vec4 uWindRange; // uMin, uMax, vMin, vMax

  vec2 windAt(float lat, float lon) {
    vec2 uv = vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0);
    vec2 rg = texture2D(uWind, uv).rg;
    return vec2(
      mix(uWindRange.x, uWindRange.y, rg.x),
      mix(uWindRange.z, uWindRange.w, rg.y)
    );
  }
`;

export const simVertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const simFragment = /* glsl */ `
  ${windGlsl}

  uniform sampler2D uState;
  uniform float uDt;
  uniform float uSpeed;
  uniform float uSeed;
  uniform bool uInit;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    ivec2 cell = ivec2(gl_FragCoord.xy);
    vec4 s = texelFetch(uState, cell, 0);
    float lat = s.x, lon = s.y, age = s.z, life = s.w;

    vec2 seed = gl_FragCoord.xy + uSeed;
    bool respawn = uInit || age <= 0.0 || abs(lat) > 85.0;

    if (respawn) {
      // Küre yüzeyine eşit dağılım için enlem asin ile
      lat = asin(hash(seed) * 2.0 - 1.0) / DEG;
      lon = hash(seed + 19.19) * 360.0 - 180.0;
      age = uInit ? hash(seed + 47.3) * 5.0 : 2.0 + hash(seed + 47.3) * 4.0;
      // İlk karede izler dolu başlasın, sonradan doğanlar sıfırdan büyüsün
      life = uInit ? age + 10.0 : age;
    } else {
      vec2 w = windAt(lat, lon);
      float cosLat = max(cos(lat * DEG), 0.1);
      lat += w.y * uSpeed * uDt;
      lon += w.x * uSpeed * uDt / cosLat;
      lon = mod(lon + 180.0, 360.0) - 180.0;
      age -= uDt;
    }

    gl_FragColor = vec4(lat, lon, age, life);
  }
`;

// STATE_W ve SEGMENTS, materyalin defines alanından gelir
export const particleVertex = /* glsl */ `
  ${windGlsl}

  uniform sampler2D uState;
  uniform float uSpeed;
  uniform float uStep;
  uniform float uRadius;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 speedColor(float speed) {
    float t = min(speed / 20.0, 1.0);
    if (t < 0.5) {
      float k = t / 0.5;
      return vec3(0.2 + 0.2 * k, 0.5 + 0.5 * k, 1.0 - 0.2 * k);
    }
    float k = (t - 0.5) / 0.5;
    return vec3(0.4 + 0.6 * k, 1.0 - 0.1 * k, 0.8 - 0.4 * k);
  }

  void main() {
    ivec2 cell = ivec2(gl_InstanceID % STATE_W, gl_InstanceID / STATE_W);
    vec4 s = texelFetch(uState, cell, 0);
    float lat = s.x, lon = s.y, age = s.z, life = s.w;

    // position.x = izdeki sıra (0 = baş). Rüzgar alanı sabit olduğu için
    // geçmiş konumlar, akış çizgisi boyunca geriye adım atarak bulunur.
    float j = position.x;
    float elapsed = max(life - age, 0.0);
    float dt = j > 0.0 ? min(j * uStep, elapsed) / j : 0.0;

    for (int k = 0; k < SEGMENTS; k++) {
      if (float(k) >= j) break;
      vec2 w = windAt(lat, lon);
      float cosLat = max(cos(lat * DEG), 0.1);
      lat = clamp(lat - w.y * uSpeed * dt, -89.0, 89.0);
      lon -= w.x * uSpeed * dt / cosLat;
    }

    vColor = speedColor(length(windAt(lat, lon)));
    vAlpha = (1.0 - j / float(SEGMENTS))
      * smoothstep(0.0, 0.4, age)       // ölürken sönsün
      * smoothstep(0.0, 0.3, elapsed);  // doğarken belirsin

    float phi = lat * DEG;
    float lambda = lon * DEG;
    vec3 p = uRadius * vec3(
      cos(phi) * cos(lambda),
      sin(phi),
      -cos(phi) * sin(lambda)
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const particleFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha * uOpacity);
  }
`;
