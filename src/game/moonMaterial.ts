import * as THREE from "three";
import { createMoonPbrMaps, type MoonPbrMaps } from "./moonPbrMaps";
import { sunLightDir } from "./sun";
import { MOON_RADIUS } from "./terrain";

/**
 * Photoreal lunar regolith — MeshPhysicalMaterial + triplanar PBR maps
 * with parallax occlusion mapping for 3D surface depth.
 */
export function createMoonMaterial(): THREE.MeshPhysicalMaterial {
  const maps: MoonPbrMaps = createMoonPbrMaps(512);

  const material = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0,
    // No sheen / specular fill — night side must stay pitch black.
    sheen: 0,
    specularIntensity: 0,
    fog: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMoonRadius = { value: MOON_RADIUS };
    shader.uniforms.uAlbedoMap = { value: maps.albedo };
    shader.uniforms.uNormalMap = { value: maps.normal };
    shader.uniforms.uOrmMap = { value: maps.orm };
    shader.uniforms.uPbrScale = { value: 0.085 };
    shader.uniforms.uNormalStrength = { value: 1.35 };
    /** World-space POM depth (meters of visual relief). */
    shader.uniforms.uPomScale = { value: 0.55 };
    shader.uniforms.uPomMinLayers = { value: 8 };
    shader.uniforms.uPomMaxLayers = { value: 24 };
    // Shared ref — World updates sunLightDir each frame.
    shader.uniforms.uSunDir = { value: sunLightDir };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      varying vec3 vMoonWorldPos;
      varying vec3 vMoonWorldNormal;
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      /* glsl */ `
      #include <begin_vertex>
      vec4 moonWorld = modelMatrix * vec4( transformed, 1.0 );
      vMoonWorldPos = moonWorld.xyz;
      vMoonWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      uniform float uMoonRadius;
      uniform sampler2D uAlbedoMap;
      uniform sampler2D uNormalMap;
      uniform sampler2D uOrmMap;
      uniform float uPbrScale;
      uniform float uNormalStrength;
      uniform float uPomScale;
      uniform float uPomMinLayers;
      uniform float uPomMaxLayers;
      uniform vec3 uSunDir;
      varying vec3 vMoonWorldPos;
      varying vec3 vMoonWorldNormal;

      // Shared across fragment chunks (POM sample point + self-shadow).
      vec3 moonSamplePos;
      vec3 moonGeoN;
      float moonPomShadow;

      float moonHash( vec3 p ) {
        p = fract( p * 0.3183099 + vec3( 0.1, 0.17, 0.23 ) );
        p *= 17.0;
        return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
      }

      float moonNoise( vec3 x ) {
        vec3 i = floor( x );
        vec3 f = fract( x );
        f = f * f * ( 3.0 - 2.0 * f );
        return mix(
          mix(
            mix( moonHash( i ), moonHash( i + vec3( 1, 0, 0 ) ), f.x ),
            mix( moonHash( i + vec3( 0, 1, 0 ) ), moonHash( i + vec3( 1, 1, 0 ) ), f.x ),
            f.y
          ),
          mix(
            mix( moonHash( i + vec3( 0, 0, 1 ) ), moonHash( i + vec3( 1, 0, 1 ) ), f.x ),
            mix( moonHash( i + vec3( 0, 1, 1 ) ), moonHash( i + vec3( 1, 1, 1 ) ), f.x ),
            f.y
          ),
          f.z
        );
      }

      float moonFbm( vec3 p, int octaves ) {
        float sum = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for ( int i = 0; i < 6; i++ ) {
          if ( i >= octaves ) break;
          sum += amp * moonNoise( p * freq );
          freq *= 2.17;
          amp *= 0.5;
        }
        return sum;
      }

      vec3 moonTriplanarBlend( vec3 n ) {
        vec3 b = abs( n );
        b = pow( b, vec3( 4.0 ) );
        return b / ( b.x + b.y + b.z + 1e-5 );
      }

      vec4 moonTriplanarSample( sampler2D tex, vec3 p, vec3 n, float scale ) {
        vec3 blend = moonTriplanarBlend( n );
        vec3 sp = p * scale;
        vec4 cx = texture2D( tex, sp.yz );
        vec4 cy = texture2D( tex, sp.xz );
        vec4 cz = texture2D( tex, sp.xy );
        return cx * blend.x + cy * blend.y + cz * blend.z;
      }

      float moonHeight( vec3 p, vec3 n, float scale ) {
        return moonTriplanarSample( uOrmMap, p, n, scale ).a;
      }

      vec3 moonTriplanarNormal( sampler2D tex, vec3 p, vec3 n, float scale, float strength ) {
        vec3 blend = moonTriplanarBlend( n );
        vec3 sp = p * scale;

        vec3 tx = texture2D( tex, sp.yz ).xyz * 2.0 - 1.0;
        vec3 ty = texture2D( tex, sp.xz ).xyz * 2.0 - 1.0;
        vec3 tz = texture2D( tex, sp.xy ).xyz * 2.0 - 1.0;
        tx.xy *= strength;
        ty.xy *= strength;
        tz.xy *= strength;

        vec3 nx = vec3( 0.0, tx.x, tx.y ) + n * tx.z;
        vec3 ny = vec3( ty.x, 0.0, ty.y ) + n * ty.z;
        vec3 nz = vec3( tz.x, tz.y, 0.0 ) + n * tz.z;

        nx.x *= sign( n.x + 1e-5 );
        ny.y *= sign( n.y + 1e-5 );
        nz.z *= sign( n.z + 1e-5 );

        return normalize( nx * blend.x + ny * blend.y + nz * blend.z );
      }

      /**
       * World-space triplanar parallax occlusion mapping.
       * Marches the view ray through the heightfield and returns the
       * displaced sample position — gives real 3D cavity depth.
       */
      vec3 moonParallaxPos( vec3 P, vec3 N, vec3 V ) {
        float ndotv = max( dot( N, V ), 0.05 );
        float layers = mix( uPomMaxLayers, uPomMinLayers, ndotv );
        layers = clamp( layers, uPomMinLayers, uPomMaxLayers );

        // March along the surface (tangent view) and slightly into the crust.
        vec3 Tview = normalize( V - N * dot( V, N ) );
        float layerDepth = 1.0 / layers;
        vec3 delta = -( Tview / ndotv ) * ( uPomScale * layerDepth );
        delta -= N * ( uPomScale * 0.25 * layerDepth );

        float curLayer = 0.0;
        vec3 cur = P;
        float h = moonHeight( cur, N, uPbrScale );

        for ( int i = 0; i < 32; i++ ) {
          if ( float( i ) >= layers ) break;
          if ( curLayer >= h ) break;
          cur += delta;
          h = moonHeight( cur, N, uPbrScale );
          curLayer += layerDepth;
        }

        // Refine between last two samples.
        vec3 prev = cur - delta;
        float afterDepth = curLayer - h;
        float beforeDepth = moonHeight( prev, N, uPbrScale ) - ( curLayer - layerDepth );
        float w = afterDepth / max( afterDepth + beforeDepth, 1e-4 );
        return mix( cur, prev, clamp( w, 0.0, 1.0 ) );
      }

      /** Soft self-shadow from the heightfield toward the sun. */
      float moonHeightShadow( vec3 P, vec3 N, vec3 L ) {
        float ndotl = dot( N, L );
        if ( ndotl <= 0.0 ) return 0.0;

        float shadow = 1.0;
        vec3 stepL = L * ( uPomScale * 0.28 );
        vec3 cur = P + N * 0.02;
        float h0 = moonHeight( P, N, uPbrScale );

        for ( int i = 1; i <= 8; i++ ) {
          cur += stepL;
          float h = moonHeight( cur, N, uPbrScale );
          float rayH = h0 + float( i ) * 0.065;
          // Wider smoothstep = softer micro-shadow edges (less grain banding).
          shadow = min( shadow, 1.0 - smoothstep( rayH - 0.06, rayH + 0.16, h ) );
        }
        return mix( 0.15, 1.0, smoothstep( 0.0, 0.85, shadow ) );
      }

      /**
       * Macro crater-bowl shadow aligned to the sun: far walls / floors of
       * depressions go dark when the sun is on the opposite side.
       */
      float moonCraterSunShadow( vec3 worldPos, vec3 N, vec3 L ) {
        vec3 radial = normalize( worldPos );
        float elev = length( worldPos ) - uMoonRadius;
        // Hard vacuum terminator — no wrap light onto the night side.
        float ndotl = dot( N, L );
        float sunAbove = dot( radial, L );
        if ( ndotl <= 0.0 || sunAbove <= 0.0 ) return 0.0;

        float lit = smoothstep( 0.0, 0.12, ndotl );
        float inBowl = smoothstep( 1.0, -4.0, elev );
        vec3 slope = N - radial * dot( N, radial );
        float slopeLen = length( slope );
        float antiSun = slopeLen > 1e-4
          ? clamp( -dot( slope / slopeLen, L ), 0.0, 1.0 )
          : 0.0;
        antiSun = smoothstep( 0.05, 0.85, antiSun );
        float sunElev = clamp( sunAbove, 0.0, 1.0 );
        float rimShade = antiSun * inBowl * ( 1.0 - sunElev * 0.7 );
        rimShade = smoothstep( 0.0, 0.9, rimShade );
        return lit * mix( 1.0, 0.08, rimShade );
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      /* glsl */ `
      #include <color_fragment>
      {
        moonGeoN = normalize( vMoonWorldNormal );
        vec3 V = normalize( cameraPosition - vMoonWorldPos );
        moonSamplePos = moonParallaxPos( vMoonWorldPos, moonGeoN, V );

        // Same live sun dir as the directional light / sky disc.
        vec3 L = normalize( uSunDir );
        float micro = moonHeightShadow( moonSamplePos, moonGeoN, L );
        float crater = moonCraterSunShadow( vMoonWorldPos, moonGeoN, L );
        moonPomShadow = micro * crater;

        vec3 dir = normalize( vMoonWorldPos );
        float elev = length( vMoonWorldPos ) - uMoonRadius;

        float mare = smoothstep( 1.5, -3.5, elev );
        float highland = 1.0 - mare;
        float mottling = moonFbm( dir * uMoonRadius * 0.045, 5 );
        float ejecta = smoothstep( 0.62, 0.82, mottling ) * highland;

        vec3 highlandCol = vec3( 0.62, 0.59, 0.53 );
        vec3 mareCol = vec3( 0.22, 0.21, 0.20 );
        vec3 ejectaCol = vec3( 0.74, 0.72, 0.66 );

        vec3 macro = mix( highlandCol, mareCol, mare );
        macro = mix( macro, ejectaCol, ejecta * 0.55 );

        vec3 detail = moonTriplanarSample( uAlbedoMap, moonSamplePos, moonGeoN, uPbrScale ).rgb;
        vec3 albedo = macro * ( 0.55 + detail * 0.9 );

        diffuseColor.rgb *= albedo;
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `
      #include <normal_fragment_maps>
      {
        float elev = length( vMoonWorldPos ) - uMoonRadius;
        float strength = uNormalStrength * mix( 0.8, 1.15, smoothstep( -4.0, 2.0, elev ) );
        vec3 worldN = moonTriplanarNormal(
          uNormalMap, moonSamplePos, moonGeoN, uPbrScale, strength
        );
        float grain = ( moonNoise( moonSamplePos * 2.4 ) - 0.5 ) * 0.06;
        worldN = normalize( worldN + moonGeoN * grain );
        vec3 viewN = normalize( mat3( viewMatrix ) * worldN );
        normal = normalize( mix( normal, viewN, 0.85 ) );
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      /* glsl */ `
      #include <roughnessmap_fragment>
      {
        vec3 orm = moonTriplanarSample( uOrmMap, moonSamplePos, moonGeoN, uPbrScale ).rgb;
        float elev = length( vMoonWorldPos ) - uMoonRadius;
        float dusty = mix( 0.97, 0.88, smoothstep( -2.0, 3.0, elev ) );
        roughnessFactor = clamp( roughnessFactor * orm.g * dusty / 0.92, 0.78, 0.995 );
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      /* glsl */ `
      #include <metalnessmap_fragment>
      {
        float metalFleck = moonTriplanarSample( uOrmMap, moonSamplePos, moonGeoN, uPbrScale ).b;
        metalnessFactor = clamp( metalnessFactor + metalFleck * 0.35, 0.0, 0.2 );
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <aomap_fragment>",
      /* glsl */ `
      #include <aomap_fragment>
      {
        vec3 L = normalize( uSunDir );
        vec3 radial = normalize( vMoonWorldPos );
        // Night hemisphere + backfaces: kill every light term (no grey fill).
        float sunMask = step( 0.0, dot( radial, L ) ) * step( 0.0, dot( moonGeoN, L ) );
        sunMask *= moonPomShadow;

        reflectedLight.directDiffuse *= sunMask;
        reflectedLight.directSpecular *= sunMask;
        reflectedLight.indirectDiffuse *= 0.0;
        reflectedLight.indirectSpecular *= 0.0;
      }
      `,
    );

    // Fog only on the sunlit side — otherwise night terrain washes to grey fog.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      /* glsl */ `
      #ifdef USE_FOG
        {
          vec3 L = normalize( uSunDir );
          float day = step( 0.0, dot( normalize( vMoonWorldNormal ), L ) )
            * step( 0.0, dot( normalize( vMoonWorldPos ), L ) );
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * day );
        }
      #endif
      `,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => "moon-regolith-night-black-v6";

  const baseDispose = material.dispose.bind(material);
  material.dispose = () => {
    maps.dispose();
    baseDispose();
  };

  return material;
}
