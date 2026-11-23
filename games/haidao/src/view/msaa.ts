/**
 * 画布要不要开 WebGL 多重采样（Phaser 的 antialiasGL）。
 * 真 GPU 上 MSAA 几乎不要钱，关了只白白多出锯齿（Graphics 画的格线、椭圆）；只有软件光栅（没显卡的机器，CPU 逐像素算）上它让每个像素多算几倍，
 * 软件光栅上 MSAA 每像素多算几倍，掉帧明显（守岛 34 → 24 帧）。所以按渲染器决定：软件光栅关，真 GPU 和读不到渲染器都开。
 * 手机平板一律开：真机都有 GPU；无头测量里手机关掉 MSAA 会偶发几十秒不出帧（原因没查清）。
 */

/** 软件光栅的渲染器名（Chrome 的 SwiftShader、Mesa 的 llvmpipe / softpipe、Windows 的 Microsoft Basic Render 等） */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareRenderer(renderer: string | null): boolean {
  return !!renderer && SOFTWARE.test(renderer);
}

/** override：`?msaa=1` / `?msaa=0` 强制（帧率 A/B 用），null 表示没传 */
export function wantMsaa(lowMemory: boolean, renderer: string | null, override: string | null): boolean {
  if (override !== null) return override === '1';
  if (lowMemory) return true;
  return !isSoftwareRenderer(renderer);
}

/** 用一个临时 WebGL 上下文读渲染器名，读完立刻释放；读不到返回 null */
export function glRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name || null;
  } catch {
    return null;
  }
}
