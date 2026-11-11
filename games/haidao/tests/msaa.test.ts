import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, wantMsaa } from '../src/view/msaa.ts';

describe('按渲染器决定多重采样', () => {
  it('认得出软件光栅', () => {
    for (const r of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.6, 256 bits)',
      'Mesa softpipe',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
      'Software Rasterizer',
    ]) expect(isSoftwareRenderer(r), r).toBe(true);
  });

  it('真 GPU 和读不到都不算软件光栅', () => {
    for (const r of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M1',
      'Mali-G78',
      'Adreno (TM) 650',
      'Mesa Intel(R) Xe Graphics (TGL GT2)',
      '',
      null,
    ]) expect(isSoftwareRenderer(r), String(r)).toBe(false);
  });

  it('电脑：软件光栅关，真 GPU 和读不到开', () => {
    expect(wantMsaa(false, 'Google SwiftShader', null)).toBe(false);
    expect(wantMsaa(false, 'llvmpipe (LLVM 15.0.6, 256 bits)', null)).toBe(false);
    expect(wantMsaa(false, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', null)).toBe(true);
    expect(wantMsaa(false, null, null)).toBe(true);
  });

  it('手机平板一律开；?msaa 强制优先', () => {
    expect(wantMsaa(true, 'Google SwiftShader', null)).toBe(true);
    expect(wantMsaa(true, null, '0')).toBe(false);
    expect(wantMsaa(false, 'Apple M1', '0')).toBe(false);
    expect(wantMsaa(false, 'Google SwiftShader', '1')).toBe(true);
  });
});
