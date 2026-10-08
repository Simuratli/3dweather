// Küre üzerindeki noktanın enlem/boylamını konumdan bulur (utils/geo ile aynı eksenler)
export const sphereVertex = /* glsl */ `
  varying vec3 vPos;

  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const latLonGlsl = /* glsl */ `
  #define DEG 0.017453292519943295
  varying vec3 vPos;

  vec2 latLon() {
    vec3 p = normalize(vPos);
    return vec2(asin(p.y) / DEG, atan(-p.z, p.x) / DEG);
  }

  // GFS ızgarası: 360x181, değerler piksel merkezinde, satır 0 = 90° K.
  // TextureLoader resmi ters çevirdiği için v = 1 kuzey.
  vec2 gridUv(vec2 ll) {
    return vec2((ll.y + 180.0 + 0.5) / 360.0, (ll.x + 90.0 + 0.5) / 181.0);
  }

  // ±180°'de u 1'den 0'a atlar; türev orada patlar ve mipmap seçimi bozulup
  // tarih çizgisinde ince bir hat çıkar. Türevleri sıçramasız koordinattan al.
  vec4 sampleSeamless(sampler2D tex, vec2 uv) {
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    float alt = fract(uv.x + 0.5);
    float dxAlt = dFdx(alt);
    float dyAlt = dFdy(alt);
    if (abs(dxAlt) < abs(dx.x)) dx.x = dxAlt;
    if (abs(dyAlt) < abs(dy.x)) dy.x = dyAlt;
    return textureGrad(tex, uv, dx, dy);
  }
`;

export const fieldFragment = /* glsl */ `
  ${latLonGlsl}
  uniform sampler2D uData;
  uniform sampler2D uLut;

  void main() {
    float t = sampleSeamless(uData, gridUv(latLon())).r;
    // LUT pikselinin merkezinden oku ki uçlar kesilmesin
    gl_FragColor = texture2D(uLut, vec2(t * 255.0 / 256.0 + 0.5 / 256.0, 0.5));
  }
`;

export const isobarFragment = /* glsl */ `
  ${latLonGlsl}
  uniform sampler2D uData;
  uniform vec2 uRange;     // min, max (hPa)
  uniform float uInterval; // çizgi aralığı (hPa)

  void main() {
    float p = mix(uRange.x, uRange.y, sampleSeamless(uData, gridUv(latLon())).r);
    float q = p / uInterval;
    // fwidth ile ekranda sabit kalınlıkta, kenarı yumuşak çizgi
    float d = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    float line = 1.0 - smoothstep(0.5, 1.5, d);
    // Her 5. çizgi (20 hPa) daha belirgin
    bool major = mod(floor(q + 0.5), 5.0) < 0.5;
    gl_FragColor = vec4(vec3(1.0), line * (major ? 0.9 : 0.45));
  }
`;

export const satelliteFragment = /* glsl */ `
  ${latLonGlsl}
  uniform sampler2D uImage;

  void main() {
    vec2 ll = latLon();
    // GIBS görüntüsü tam küreyi kaplar, kenarlar ±180 / ±90
    vec3 c = sampleSeamless(uImage, vec2((ll.y + 180.0) / 360.0, (ll.x + 90.0) / 180.0)).rgb;

    // Bulut maskesi: parlak ve renksiz pikseller. Kar, buz ve tuz gölleri de
    // parlak olduğu için onlar da bulut sanılabilir.
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float cloud = smoothstep(0.35, 0.75, lum) * (1.0 - smoothstep(0.08, 0.25, sat));
    gl_FragColor = vec4(vec3(min(lum * 1.1, 1.0)), cloud * 0.95);
  }
`;
