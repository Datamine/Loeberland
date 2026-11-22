const alpineAtlasURL = new URL('../textures/alpine-materials.svg', import.meta.url);
const alpineUploads = new WeakMap<
  WebGLRenderingContext,
  { textures: (WebGLTexture | null)[]; ready: boolean; error: string | null }
>();
let alpineImage: HTMLImageElement | null = null;
export function createAlpineTexture(gl: WebGLRenderingContext) {
  const state = {
    textures: Array.from({ length: 4 }, () => gl.createTexture()),
    ready: false,
    error: null as 'Could not load alpine materials' | null,
  };
  alpineUploads.set(gl, state);
  for (const [i, texture] of state.textures.entries()) {
    gl.activeTexture(gl.TEXTURE3 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([226, 233, 229, 255] satisfies [number, number, number, number]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }
  const upload = () => {
    if (alpineUploads.get(gl) !== state || gl.isContextLost()) return;
    // Crop each authored swatch once. Independent repeat textures preserve
    // derivatives and prevent neighboring swatches bleeding into mipmaps.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!,
      aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    for (const [i, texture] of state.textures.entries()) {
      ctx.clearRect(0, 0, 512, 512);
      ctx.drawImage(alpineImage!, (i % 2) * 512, Math.floor(i / 2) * 512, 512, 512, 0, 0, 512, 512);
      gl.activeTexture(gl.TEXTURE3 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso)
        gl.texParameterf(
          gl.TEXTURE_2D,
          aniso.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
        );
    }
    gl.activeTexture(gl.TEXTURE0);
    state.ready = true;
  };
  if (!alpineImage) {
    alpineImage = new Image();
    alpineImage.src = alpineAtlasURL.href;
  }
  if (alpineImage.complete && alpineImage.naturalWidth) upload();
  else {
    alpineImage.addEventListener('load', upload, { once: true });
    alpineImage.addEventListener(
      'error',
      () => {
        state.error = 'Could not load alpine materials';
      },
      { once: true },
    );
  }
  gl.activeTexture(gl.TEXTURE0);
  return state;
}

/** Three projections keep cliff texture scale independent of slope. The same
 * world coordinates span every triangle; mipmaps suppress distant grain. */
export const ALPINE_TEXTURE_GLSL = `
vec3 alpineSwatch(float slot,vec2 uv){
    if(slot<.5)return texture2D(uAlpineSnow,uv).rgb;
    if(slot<1.5)return texture2D(uAlpineGroom,uv).rgb;
    if(slot<2.5)return texture2D(uAlpineRock,uv).rgb;
    return texture2D(uAlpineForest,uv).rgb;
}
vec3 alpineSurface(vec3 p,vec3 n,float groom){
    vec3 weights=pow(abs(n),vec3(4.));weights/=max(dot(weights,vec3(1.)),.001);
    vec3 granite=alpineSwatch(2.,p.zy*.22)*weights.x+alpineSwatch(2.,p.xz*.22)*weights.y+alpineSwatch(2.,p.xy*.22)*weights.z;
    vec3 powder=alpineSwatch(0.,p.xz*.24);
    vec3 piste=alpineSwatch(1.,p.xz*.35);
    vec3 forest=alpineSwatch(3.,p.xz*.4);
    float aspect=dot(n.xz,vec2(.55,-.83));
    float pockets=sin(p.x*.145+p.z*.09)*sin(p.z*.124-p.x*.077);
    float scree=sin(p.x*.28+p.z*.31)*sin(p.z*.24-p.x*.09);
    float cliff=1.-smoothstep(.5,.91,n.y);
    float snowLine=smoothstep(31.,70.,p.y+12.*aspect+8.*pockets);
    float cover=max(snowLine*(1.-cliff*.86),groom);
    vec3 woods=mix(forest*vec3(.76,.87,.8),forest*vec3(1.18,1.06,.88),smoothstep(-.6,.64,pockets));
    float rock=max(smoothstep(24.,67.,p.y),cliff*smoothstep(-.4,.86,scree));
    vec3 base=mix(woods,granite,rock);
    float sand=(1.-smoothstep(10.15,11.65,p.y))*(1.-cliff);
    base=mix(base,granite*vec3(1.19,1.12,.94),sand*.78);
    vec3 snow=mix(powder,piste,clamp(groom,0.,1.)*.9);
    float detail=alpineSwatch(0.,p.xz*1.7).r;
    snow*=.945+detail*.065;
    return mix(base,snow,cover);
}
`;
