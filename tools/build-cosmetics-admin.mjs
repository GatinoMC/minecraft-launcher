// Reuse the launcher's tested Java model renderer in the cosmetics admin panel.
// Run from the launcher root: node tools/build-cosmetics-admin.mjs <output.js>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const { build } = createRequire(new URL('../xmcl-electron-app/package.json', import.meta.url))('esbuild');
const outfile = process.argv[2];
if (!outfile) throw new Error('Provide the cosmetics service public/cosmetic-preview.js output path');
await build({
  stdin: { contents: `export * from './xmcl-keystone-ui/src/util/cosmeticGeometry'; export * from './xmcl-keystone-ui/src/util/cosmeticMaterials';`, resolveDir: resolve('.') },
  bundle: true, format: 'iife', globalName: 'MineLatinoCosmetics', platform: 'browser', target: 'es2022', outfile,
  banner: { js: '// Generated from MineLatino Launcher cosmeticGeometry.ts and cosmeticMaterials.ts. Do not edit by hand.' },
  plugins: [{ name: 'admin-adapter', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'admin' }));
    b.onResolve({ filter: /^@\/composables\/cosmeticsStore$/ }, () => ({ path: 'resources', namespace: 'admin' }));
    b.onLoad({ filter: /.*/, namespace: 'admin' }, ({ path }) => ({ contents: path === 'three'
      ? 'export const { BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, Texture } = globalThis.THREE;'
      : 'export function resourceUrl(product) { return `/v1/resources/${encodeURIComponent(product.id)}?v=${encodeURIComponent(product.resourceVersion || "")}`; }', loader: 'js' }));
  } }],
});
