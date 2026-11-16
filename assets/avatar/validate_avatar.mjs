// Validate mother_child.glb (cartoon clinic scene) against docs/specs/avatar-asset.md
// Usage: node validate_avatar.mjs path/to/mother_child.glb
import fs from 'node:fs';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import validator from 'gltf-validator';

const file = process.argv[2] ?? 'out/mother_child.glb';
const REGIONS = ['palm_hands', 'feet', 'mouth_throat', 'buttocks_knees'];
const MORPHS = ['jawOpen', 'eyeBlink_L', 'eyeBlink_R'];
const PARTS = [
  'Mother', 'Mother_Head', 'Mother_Hair', 'Mother_Torso', 'Mother_ArmL', 'Mother_ArmR', 'Mother_Legs', 'Mother_Shoes',
  'Child', 'Child_Head', 'Child_Hair', 'Child_Torso', 'Child_Shorts', 'Child_ArmL', 'Child_ArmR', 'Child_HandL',
  'Child_HandR', 'Child_LegL', 'Child_LegR', 'Child_FootL', 'Child_FootR',
  'Room', 'Floor', 'Wall_Back', 'Wall_Left', 'Window', 'Exam_Bed', 'Step_Stool', 'Doctor_Stool', 'Desk', 'Computer',
  'Cabinet', 'Trash_Bin', 'Height_Chart', 'Poster', 'Wall_Clock', 'IV_Stand', 'Monitor', 'Curtain', 'Teddy',
];
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const xf = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);

const bytes = fs.readFileSync(file);
check('file size < 5 MB', bytes.length < 5 * 1024 * 1024, `${(bytes.length / 1024).toFixed(1)} KB`);
const report = await validator.validateBytes(new Uint8Array(bytes));
check('Khronos glTF validator: 0 errors', report.issues.numErrors === 0,
  `${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.readBinary(new Uint8Array(bytes));
const root = doc.getRoot();
const nodes = root.listNodes();
const byName = (n) => nodes.find((x) => x.getName() === n);

check('uses KHR_draco_mesh_compression',
  root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_draco_mesh_compression'));

// ---- part list: every part exists, has label + info in extras
const missing = PARTS.filter((n) => !byName(n));
check(`all ${PARTS.length} named parts present`, missing.length === 0, missing.join(', '));
const noLabel = PARTS.filter((n) => byName(n) && !(byName(n).getExtras().label && byName(n).getExtras().info));
check('every part has extras.label and extras.info', noLabel.length === 0, noLabel.join(', '));
const names = nodes.map((n) => n.getName());
check('node names are unique', new Set(names).size === names.length);

// ---- budget
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
check('triangles < 50k', tris < 50000, `${tris}`);
check('materials < 30', root.listMaterials().length < 30, `${root.listMaterials().length}`);
check('no textures baked into the GLB', root.listTextures().length === 0);

// ---- mother: morphs, bone
const morphMesh = root.listMeshes().find((m) => (m.getExtras().targetNames ?? []).includes('jawOpen'));
const targetNames = morphMesh?.getExtras().targetNames ?? [];
for (const t of MORPHS) check(`morph target "${t}"`, targetNames.includes(t));
check('morph default weights are 0', (morphMesh?.getWeights() ?? [1]).every((w) => w === 0));
const joints = root.listSkins()[0]?.listJoints().map((j) => j.getName()) ?? [];
check('bone "head" is a skin joint', joints.includes('head'), `joints: ${joints.join(', ')}`);
const headBone = byName('head');
const headNode = byName('Mother_Head');
check('Mother_Head and Mother_Hair are children of bone "head"',
  headBone?.listChildren().includes(headNode) && headBone.listChildren().includes(byName('Mother_Hair')));
check('Mother_Head carries the morph targets', headNode?.getMesh() === morphMesh);

// ---- frame of reference
const shoes = getBounds(byName('Mother_Shoes'));
check('origin between mother feet, floor at Y=0',
  Math.abs(shoes.min[1]) < 0.01 && Math.abs(shoes.min[0] + shoes.max[0]) < 0.02 && Math.abs(shoes.min[2] + shoes.max[2]) < 0.2,
  `shoes minY=${shoes.min[1].toFixed(3)}`);
const top = getBounds(byName('Mother_Hair')).max[1];
check('units = metres (seated mother 1.2–1.8 m)', top > 1.2 && top < 1.8, `${top.toFixed(2)} m`);
const mouthPrim = morphMesh.listPrimitives().find((p) => p.getMaterial()?.getName() === 'mouth_inner');
const mp = mouthPrim.getAttribute('POSITION');
const mouthW = xf(headNode.getWorldMatrix(), mp.getMinNormalized([]).map((v, i) => (v + mp.getMaxNormalized([])[i]) / 2));
const hb = getBounds(headNode);
check('mother faces +Z', mouthW[2] > (hb.min[2] + hb.max[2]) / 2 + 0.1, `mouth z=${mouthW[2].toFixed(3)}`);

// ---- colliders
for (const r of REGIONS) {
  const n = byName(`collider_${r}`);
  check(`collider_${r}`, n?.getMesh() && n.getExtras().regionId === r);
}

// ---- child_skin: one material, UV atlas
const T = 1 / 3;
const CELLS = { palm_hands: [0, 0, T, 0.5], feet: [T, 0, 2 * T, 0.5], mouth_throat: [2 * T, 0, 1, 0.5] };
const skinPrims = [];
for (const n of nodes) for (const p of n.getMesh()?.listPrimitives() ?? []) {
  if (p.getMaterial()?.getName() === 'child_skin') skinPrims.push([n, p]);
}
check('child_skin is a single shared material', root.listMaterials().filter((m) => m.getName() === 'child_skin').length === 1,
  `${skinPrims.length} primitives`);
check('all child_skin primitives have TEXCOORD_0', skinPrims.length > 0 && skinPrims.every(([, p]) => p.getAttribute('TEXCOORD_0')));
for (const r of Object.keys(CELLS)) {
  const b = getBounds(byName(`collider_${r}`));
  let inside = 0, inCell = 0;
  const p = [], q = [];
  for (const [n, prim] of skinPrims) {
    const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), wm = n.getWorldMatrix();
    for (let i = 0; i < pos.getCount(); i++) {
      const w = xf(wm, pos.getElement(i, p));
      if (!w.every((v, k) => v >= b.min[k] && v <= b.max[k])) continue;
      inside++;
      uv.getElement(i, q);
      const c = CELLS[r];
      if (q[0] >= c[0] && q[0] <= c[2] && q[1] >= c[1] && q[1] <= c[3]) inCell++;
    }
  }
  check(`skin inside collider_${r} mostly maps to its UV cell`, inside > 0 && inCell / inside > 0.6 /* wrist/ankle cap vertices overlap the box */, `${inCell}/${inside}`);
}

const fail = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
console.log(`\n${results.length - fail.length}/${results.length} checks passed`);
process.exit(fail.length ? 1 : 0);
