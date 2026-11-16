"""
Cartoon clinic scene: mother holding her child on an exam bed, in a hospital examination room.
Every clickable part is its own named mesh with `label` / `info` custom properties (-> glTF extras).
Keeps the Slice 16 contract: morphs jawOpen/eyeBlink_L/eyeBlink_R, bone `head`, 4 colliders, `child_skin`.

Run:  python3 build_clinic_scene.py --out out/mother_child_raw.glb [--blend x.blend] [--render preview.png]
Blender: Z up, characters face -Y (=> +Z in glTF), character left = +X. Origin = between the mother's feet.
"""
import argparse
import math
import sys

import bpy  # must be imported before bmesh/mathutils
import bmesh
from mathutils import Matrix, Vector

MATS = {}


def lin(hex_):
    h = hex_.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c]


def mat(name, hex_=None, rough=0.7, metal=0.0, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(hex_), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*lin(emit), 1)
        b.inputs["Emission Strength"].default_value = 1.0
    MATS[name] = m
    return m


def _bm():
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    return bm


def _obj(name, bm, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
        mesh.set_sharp_from_angle(angle=math.radians(50))
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    return o


def sphere(m, loc, r, scale=(1, 1, 1), seg=16, rings=10, rot=(0, 0, 0)):
    bm = _bm()
    M = (Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y")
         @ Matrix.Rotation(rot[0], 4, "X") @ Matrix.Diagonal((*scale, 1)))
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=M, calc_uvs=True)
    return _obj("p", bm, m)


def limb(m, a, b, r1, r2=None, seg=14, round_ends=False):
    """Tapered cylinder a -> b; round_ends adds spheres at both ends (capsule)."""
    a, b = Vector(a), Vector(b)
    r2 = r1 if r2 is None else r2
    d = b - a
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bm = _bm()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2,
                          depth=d.length, matrix=Matrix.Translation((a + b) / 2) @ rot, calc_uvs=True)
    if round_ends:
        for p, r in ((a, r1), (b, r2)):
            bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=8, radius=r,
                                      matrix=Matrix.Translation(p) @ rot, calc_uvs=True)
    return _obj("p", bm, m)


def rbox(m, loc, size, bevel=0.03, rot=(0, 0, 0)):
    bm = _bm()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((*size, 1)), calc_uvs=True)
    w = min(bevel, min(size) * 0.45)
    if w > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=w, offset_type="OFFSET", segments=2, profile=0.5,
                        affect="EDGES")
    M = (Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y")
         @ Matrix.Rotation(rot[0], 4, "X"))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts[:])
    return _obj("p", bm, m)


def squash(o, center, s):
    c = Vector(center)
    o.data.transform(Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)) @ Matrix.Translation(-c))
    return o


def part(name, objs, parent=None, label=None, info=None):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name + "_Mesh"
    if parent:
        o.parent = parent
    if label:
        o["label"] = label
    if info:
        o["info"] = info
    return o


def empty(name, label=None, info=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    if label:
        o["label"] = label
    if info:
        o["info"] = info
    return o


def remap_uv(obj, cell, margin=0.02):
    uv = obj.data.uv_layers.active.data
    us = [l.uv.x for l in uv]
    vs = [l.uv.y for l in uv]
    umin, umax, vmin, vmax = min(us), max(us), min(vs), max(vs)
    u0, v0, u1, v1 = cell[0] + margin, cell[1] + margin, cell[2] - margin, cell[3] - margin
    for l in uv:
        l.uv.x = u0 + (l.uv.x - umin) / max(umax - umin, 1e-6) * (u1 - u0)
        l.uv.y = v0 + (l.uv.y - vmin) / max(vmax - vmin, 1e-6) * (v1 - v0)
    return obj


def face_y(c, r, s, dx, dz):
    """y of the front (-Y) surface of an ellipsoid head at offset (dx, dz) from its centre."""
    k = 1 - (dx / (s[0] * r)) ** 2 - (dz / (s[2] * r)) ** 2
    return c[1] - s[1] * r * math.sqrt(max(k, 0.0))


def face_features(c, r, s, eye_dx, eye_dz, eye_r, mouth_dz, mouth_r, brow=None):
    """Chibi face: big eyes with highlight, blush, small mouth. Returns list of objects."""
    out = []
    for side in (+1, -1):
        dx = eye_dx * side
        y = face_y(c, r, s, dx, eye_dz)
        out.append(sphere(mat("eye_dark"), (c[0] + dx, y + 0.004, c[2] + eye_dz), eye_r,
                          scale=(0.85, 0.45, 1.12), seg=14, rings=10))
        out.append(sphere(mat("eye_white"), (c[0] + dx + eye_r * 0.3, y - eye_r * 0.36, c[2] + eye_dz + eye_r * 0.42),
                          eye_r * 0.3, seg=8, rings=6))
        bx, bz = dx * 1.75, eye_dz - eye_r * 1.6
        out.append(sphere(mat("blush"), (c[0] + bx, face_y(c, r, s, bx, bz) + 0.002, c[2] + bz), eye_r * 1.05,
                          scale=(1.15, 0.25, 0.7), seg=12, rings=6, rot=(0, 0, -0.45 * side)))
        if brow:
            bz2 = eye_dz + eye_r * 1.9
            out.append(sphere(mat(brow), (c[0] + dx, face_y(c, r, s, dx, bz2) - 0.001, c[2] + bz2), eye_r * 0.75,
                              scale=(1.3, 0.3, 0.22), seg=10, rings=6, rot=(0, -0.12 * side, 0)))
    out.append(sphere(mat("mouth_inner"), (c[0], face_y(c, r, s, 0, mouth_dz) + 0.003, c[2] + mouth_dz), mouth_r,
                      scale=(1.0, 0.4, 0.42), seg=12, rings=8))
    return out


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def palette():
    mat("mother_skin", "#F5C9A8", 0.6)
    mat("child_skin", "#F8D4BA", 0.6)
    mat("hair", "#4A3428", 0.55)
    mat("child_hair", "#3A2A22", 0.55)
    mat("eye_dark", "#2A1C18", 0.25)
    mat("eye_white", "#FFFFFF", 0.3)
    mat("blush", "#F4A6A6", 0.8)
    mat("mouth_inner", "#C4545A", 0.5)
    mat("mother_top", "#F6B9AE", 0.8)
    mat("mother_pants", "#8FA6D8", 0.85)
    mat("shoe", "#FDFBF7", 0.6)
    mat("child_tee", "#FFDF8A", 0.8)
    mat("child_shorts", "#8CCBE6", 0.85)
    mat("white", "#F4F6F8", 0.6)
    mat("mint", "#BEE7D6", 0.75)
    mat("wood", "#D9A877", 0.7)
    mat("metal", "#B8C2CC", 0.35, 0.6)
    mat("wall", "#FFF6EC", 0.9)
    mat("floor", "#E8DCCB", 0.8)
    mat("curtain", "#CBE4F4", 0.85)
    mat("coral", "#F28B82", 0.7)
    mat("sun", "#FFD98A", 0.7)
    mat("screen", "#1E2A38", 0.3)
    mat("screen_line", "#5CF2A0", 0.4, emit="#5CF2A0")
    mat("glass", "#DFF3FF", 0.2, emit="#CFEBFF")
    mat("display", "#BFE3F7", 0.3, emit="#9CCFEA")
    mat("teddy", "#C89B6D", 0.9)
    mat("teddy_light", "#EBD3B0", 0.9)
    mat("collider_debug", "#FF00FF", 1.0)


# ====================================================================== MOTHER
def build_mother():
    HC, HR, HS = (0, 0.36, 1.32), 0.2, (1.0, 0.95, 0.95)       # head centre / radius / scale

    # ---- rig (object named `Mother` carries the group label)
    arm = bpy.data.armatures.new("Mother_Rig")
    rig = bpy.data.objects.new("Mother", arm)
    bpy.context.scene.collection.objects.link(rig)
    rig["label"] = "Người mẹ"
    rig["info"] = "Mẹ ngồi trên giường khám, bế bé trong lòng và trả lời câu hỏi của người học."
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    chain = [("root", (0, 0.37, 0.0), (0, 0.37, 0.6)), ("spine", (0, 0.37, 0.6), (0, 0.36, 1.12)),
             ("neck", (0, 0.36, 1.12), (0, 0.36, 1.18)), ("head", (0, 0.36, 1.18), (0, 0.36, 1.52))]
    prev = None
    for n, h, t in chain:
        b = eb.new(n)
        b.head, b.tail, b.parent = h, t, prev
        prev = b
    bpy.ops.object.mode_set(mode="OBJECT")

    # ---- torso (skinned to `spine`, stays a root node)
    top = mat("mother_top")
    torso = part("Mother_Torso", [
        squash(limb(top, (0, 0.37, 0.64), (0, 0.36, 1.07), 0.165, 0.15, seg=20, round_ends=True),
               (0, 0.365, 0.8), (1, 0.8, 1)),
        limb(mat("mother_skin"), (0, 0.36, 1.09), (0, 0.36, 1.19), 0.052, 0.05),
        sphere(top, (0, 0.36, 1.15), 0.075, scale=(1.25, 1.05, 0.45), seg=16, rings=8),   # collar
    ], label="Thân mẹ", info="Áo thường ngày màu hồng đào. Thân có nhịp thở nhẹ khi ở trạng thái nghỉ.")
    vg = torso.vertex_groups.new(name="spine")
    vg.add(list(range(len(torso.data.vertices))), 1.0, "REPLACE")
    torso.modifiers.new("Armature", "ARMATURE").object = rig

    # ---- head (+ face, morph targets) and hair: rigidly parented to bone `head`
    skin = mat("mother_skin")
    head_objs = [sphere(skin, HC, HR, scale=HS, seg=28, rings=18)]
    for side in (+1, -1):
        head_objs.append(sphere(skin, (0.192 * side, 0.375, 1.3), 0.035, scale=(0.5, 0.9, 1.2), seg=10, rings=8))
    eye_dz, mouth_dz = -0.025, -0.1
    head_objs += face_features(HC, HR, HS, 0.078, eye_dz, 0.034, mouth_dz, 0.024, brow="hair")
    head = part("Mother_Head", head_objs, label="Đầu mẹ",
                info="Khuôn mặt mẹ: miệng mở theo lời nói (jawOpen), mắt chớp, đầu quay theo người học.")
    add_mother_shape_keys(head, HC[2] + eye_dz, HC[2] + mouth_dz)

    hm = mat("hair")
    hair_objs = [sphere(hm, (0, 0.4, 1.355), 0.215, scale=(1.03, 1.0, 0.98), seg=28, rings=18),
                 sphere(hm, (0, 0.5, 1.54), 0.085, seg=16, rings=10),                           # bun
                 sphere(hm, (0.085, 0.215, 1.445), 0.1, scale=(1.25, 0.5, 0.62), seg=14, rings=8, rot=(0, 0.5, 0.25)),
                 sphere(hm, (-0.075, 0.21, 1.45), 0.095, scale=(1.2, 0.5, 0.58), seg=14, rings=8, rot=(0, -0.55, -0.25))]
    for side in (+1, -1):
        hair_objs.append(sphere(hm, (0.185 * side, 0.335, 1.26), 0.07, scale=(0.5, 0.9, 1.9), seg=12, rings=8))
    hair = part("Mother_Hair", hair_objs, label="Tóc mẹ", info="Tóc nâu búi cao gọn gàng.")
    for o in (head, hair):
        o.parent, o.parent_type, o.parent_bone = rig, "BONE", "head"
    bpy.context.view_layer.update()
    for o in (head, hair):
        o.matrix_world = Matrix.Identity(4)

    # ---- arms: left arm rests on the child's hip, right arm wraps across the child's lap
    arms = {"L": ((0.195, 0.36, 1.06), (0.33, 0.25, 0.8), (0.3, 0.08, 0.71), (0.285, 0.03, 0.695)),
            "R": ((-0.195, 0.36, 1.06), (-0.27, 0.17, 0.8), (-0.07, 0.0, 0.752), (-0.01, -0.03, 0.755))}
    for k, (sh, el, wr, hand) in arms.items():
        part(f"Mother_Arm{k}", [
            limb(top, sh, el, 0.058, 0.05, round_ends=True),
            limb(skin, el, wr, 0.042, 0.036, round_ends=True),
            sphere(skin, hand, 0.05, scale=(1.0, 0.85, 0.7), seg=12, rings=8),
        ], parent=rig, label="Tay trái mẹ" if k == "L" else "Tay phải mẹ",
            info="Tay mẹ ôm đỡ bé để bé ngồi yên khi khám.")

    # ---- legs & shoes (seated: thighs forward, shins down)
    pants = mat("mother_pants")
    legs, shoes = [sphere(pants, (0, 0.38, 0.6), 0.17, scale=(1.1, 0.85, 0.62), seg=18, rings=10)], []
    for side in (+1, -1):
        x = 0.1 * side
        legs.append(limb(pants, (x, 0.36, 0.6), (x, 0.0, 0.535), 0.088, 0.078, round_ends=True))
        legs.append(limb(pants, (x, 0.0, 0.535), (x, 0.0, 0.11), 0.072, 0.056, round_ends=True))
        shoes.append(sphere(mat("shoe"), (x, -0.035, 0.05), 0.065, scale=(0.9, 1.55, 0.78), seg=14, rings=8))
        shoes.append(rbox(mat("mint"), (x, -0.035, 0.012), (0.105, 0.19, 0.022), bevel=0.01))
    part("Mother_Legs", legs, parent=rig, label="Chân mẹ", info="Mẹ ngồi ở mép giường khám, bé ngồi trên đùi trái.")
    part("Mother_Shoes", shoes, parent=rig, label="Giày mẹ", info="Giày vải trắng đế xanh.")
    return rig


def add_mother_shape_keys(obj, eye_z, mouth_z):
    me = obj.data
    names = [m.name for m in me.materials]
    eye_i, hl_i = names.index("eye_dark"), names.index("eye_white")
    mouth_i, skin_i = names.index("mouth_inner"), names.index("mother_skin")
    vmat = {}
    for p in me.polygons:
        for v in p.vertices:
            vmat[v] = p.material_index
    obj.shape_key_add(name="Basis", from_mix=False)
    jaw = obj.shape_key_add(name="jawOpen", from_mix=False)
    bl = obj.shape_key_add(name="eyeBlink_L", from_mix=False)
    br = obj.shape_key_add(name="eyeBlink_R", from_mix=False)
    for v in me.vertices:
        co, mi = v.co.copy(), vmat.get(v.index)
        k = bl if co.x > 0 else br
        if mi == eye_i:      # squash to a closed-lid line
            k.data[v.index].co = Vector((co.x, co.y + 0.004, eye_z - 0.008 + (co.z - eye_z) * 0.1))
        elif mi == hl_i:     # hide the highlight inside the head
            k.data[v.index].co = Vector((co.x, co.y + 0.05, eye_z))
        elif mi == mouth_i:
            jaw.data[v.index].co = Vector((co.x * 0.9, co.y, mouth_z - 0.014 + (co.z - mouth_z) * 3.0))
        elif mi == skin_i and co.y < 0.3 and co.z < mouth_z + 0.01 and abs(co.x) < 0.15:
            w = min(1.0, (mouth_z + 0.01 - co.z) / 0.03) * min(1.0, (0.3 - co.y) / 0.08)
            jaw.data[v.index].co = co + Vector((0, 0.003 * w, -0.018 * w))
    for k in (jaw, bl, br):
        k.value = 0.0  # exported as mesh.weights -> neutral face by default


# ====================================================================== CHILD
def build_child():
    child = empty("Child", "Em bé", "Bé khoảng 2 tuổi ngồi trong lòng mẹ. Bấm vào tay, chân, miệng, gối để khám.")
    cx = 0.15
    W = 1 / 3
    CELL = {"palm_hands": (0, 0.5, W, 1), "feet": (W, 0.5, 2 * W, 1), "mouth_throat": (2 * W, 0.5, 1, 1),
            "buttocks_knees": (0, 0, W, 0.5), "other": (2 * W, 0, 1, 0.5)}
    skin, tee, shorts = mat("child_skin"), mat("child_tee"), mat("child_shorts")

    def skin_part(name, region, objs, label, info):
        for o in objs:
            remap_uv(o, CELL[region])
        return part(name, objs, parent=child, label=label, info=info)

    # torso + shorts
    t = [squash(limb(tee, (cx, 0.09, 0.73), (cx, 0.08, 0.855), 0.107, 0.095, seg=18, round_ends=True),
                (cx, 0.085, 0.8), (1, 0.88, 1))]
    s = [sphere(shorts, (cx, 0.1, 0.695), 0.115, scale=(1.0, 0.95, 0.72), seg=18, rings=10)]
    for side, k in ((+1, "L"), (-1, "R")):
        t.append(sphere(tee, (cx + 0.108 * side, 0.072, 0.858), 0.043, seg=12, rings=8))
        hip, knee = Vector((cx + 0.055 * side, 0.05, 0.678)), Vector((cx + 0.062 * side, -0.12, 0.665))
        s.append(limb(shorts, hip, hip.lerp(knee, 0.55), 0.052, 0.048, round_ends=True))
    part("Child_Torso", t, parent=child, label="Thân bé", info="Áo thun vàng. Thân mình không nằm trong 4 vùng khám.")
    part("Child_Shorts", s, parent=child, label="Quần bé",
         info="Quần đùi che vùng mông. TODO(clinician): có cần bước cởi quần để khám mông không?")

    for side, k in ((+1, "L"), (-1, "R")):
        vn = "trái" if k == "L" else "phải"
        hip, knee = Vector((cx + 0.055 * side, 0.05, 0.678)), Vector((cx + 0.062 * side, -0.12, 0.665))
        ankle = Vector((cx + 0.062 * side, -0.137, 0.525))
        skin_part(f"Child_Leg{k}", "buttocks_knees", [
            limb(skin, hip.lerp(knee, 0.45), knee, 0.041, 0.039, round_ends=True),
            limb(skin, knee, ankle, 0.037, 0.03, round_ends=True),
        ], f"Chân {vn} của bé", "Đầu gối thuộc vùng khám buttocks_knees.")
        skin_part(f"Child_Foot{k}", "feet", [
            sphere(skin, ankle + Vector((0.002 * side, -0.028, -0.03)), 0.043, scale=(0.8, 1.4, 0.62), seg=14, rings=8),
        ], f"Bàn chân {vn} của bé", "Thuộc vùng khám feet.")
        sh = Vector((cx + 0.108 * side, 0.07, 0.858))
        el = Vector((cx + 0.19 * side, 0.03, 0.83))
        wr = Vector((cx + 0.215 * side, -0.04, 0.915))
        skin_part(f"Child_Arm{k}", "other", [
            limb(skin, sh.lerp(el, 0.35), el, 0.031, 0.028, round_ends=True),
            limb(skin, el, wr, 0.027, 0.024, round_ends=True),
        ], f"Cánh tay {vn} của bé", "Bé giơ tay chào, lòng bàn tay hướng về người khám.")
        hc = wr + Vector((0.006 * side, -0.02, 0.048))
        skin_part(f"Child_Hand{k}", "palm_hands", [
            sphere(skin, hc, 0.041, scale=(0.95, 0.45, 1.12), seg=14, rings=8),
            sphere(skin, hc + Vector((-0.034 * side, 0.0, -0.012)), 0.014, scale=(1, 0.9, 1.5), seg=8, rings=6,
                   rot=(0, 0.6 * side, 0)),
        ], f"Bàn tay {vn} của bé", "Thuộc vùng khám palm_hands.")

    # head (skin first -> primitive 0 is child_skin), face, hair
    HC, HR, HS = (cx, 0.075, 1.0), 0.135, (1.0, 0.96, 0.97)
    hs = [remap_uv(sphere(skin, HC, HR, scale=HS, seg=24, rings=16), CELL["mouth_throat"]),
          remap_uv(limb(skin, (cx, 0.08, 0.85), (cx, 0.08, 0.9), 0.04, 0.04), CELL["mouth_throat"])]
    for side in (+1, -1):
        hs.append(remap_uv(sphere(skin, (cx + 0.13 * side, 0.085, 0.99), 0.026, scale=(0.5, 0.9, 1.2), seg=10, rings=8),
                           CELL["mouth_throat"]))
    hs += face_features(HC, HR, HS, 0.052, -0.012, 0.025, -0.058, 0.019)
    part("Child_Head", hs, parent=child, label="Đầu bé", info="Vùng quanh miệng thuộc vùng khám mouth_throat.")
    ch = mat("child_hair")
    part("Child_Hair", [
        sphere(ch, (cx, 0.1, 1.03), 0.14, scale=(1.02, 1.0, 0.95), seg=24, rings=14),
        sphere(ch, (cx + 0.02, -0.03, 1.105), 0.06, scale=(1.5, 0.5, 0.5), seg=12, rings=8, rot=(0, 0.3, 0.2)),
        sphere(ch, (cx, 0.07, 1.175), 0.03, scale=(0.7, 0.7, 1.4), seg=10, rings=6, rot=(0.3, 0.2, 0)),
    ], parent=child, label="Tóc bé", info="Tóc ngắn có chỏm nhỏ.")

    # colliders (hidden at runtime); boxes hug the examined skin
    cm = mat("collider_debug")
    hl, hr_ = Vector((cx + 0.221, -0.06, 0.975)), Vector((cx - 0.221, -0.06, 0.975))
    specs = {
        "palm_hands": [rbox(cm, hl, (0.11, 0.08, 0.1), 0), rbox(cm, hr_, (0.11, 0.08, 0.1), 0)],
        "feet": [rbox(cm, (cx, -0.17, 0.483), (0.23, 0.14, 0.07), 0)],
        "mouth_throat": [rbox(cm, (cx, -0.03, 0.945), (0.085, 0.075, 0.07), 0)],
        "buttocks_knees": [rbox(cm, (cx, -0.125, 0.655), (0.22, 0.1, 0.1), 0),
                           rbox(cm, (cx, 0.19, 0.68), (0.2, 0.05, 0.1), 0)],
    }
    for region, objs in specs.items():
        o = part(f"collider_{region}", objs)
        o["regionId"] = region
        o["collider"] = True
    return child


# ====================================================================== ROOM
def build_room():
    room = empty("Room", "Phòng khám", "Phòng khám lâm sàng nhi trong bệnh viện.")
    W, MI, WD, ME = mat("white"), mat("mint"), mat("wood"), mat("metal")

    def P(name, objs, label, info):
        return part(name, objs, parent=room, label=label, info=info)

    P("Floor", [rbox(mat("floor"), (0, -0.2, -0.03), (4.2, 3.6, 0.06), 0.01)], "Sàn phòng", "Sàn vinyl màu be, dễ lau chùi.")
    P("Wall_Back", [rbox(mat("wall"), (0, 1.6, 1.25), (4.2, 0.1, 2.5), 0.01),
                    rbox(MI, (0, 1.543, 0.45), (4.2, 0.02, 0.9), 0.004),
                    rbox(W, (0, 1.538, 0.92), (4.2, 0.03, 0.05), 0.008)],
      "Tường sau", "Tường ốp chân màu xanh mint.")
    P("Wall_Left", [rbox(mat("wall"), (-2.15, -0.2, 1.25), (0.1, 3.6, 2.5), 0.01),
                    rbox(MI, (-2.093, -0.2, 0.45), (0.02, 3.6, 0.9), 0.004),
                    rbox(W, (-2.088, -0.2, 0.92), (0.03, 3.6, 0.05), 0.008)],
      "Tường trái", "Tường bên có cửa sổ.")
    P("Window", [rbox(W, (-2.085, -0.75, 1.6), (0.06, 1.2, 1.0), 0.015),
                 rbox(mat("glass"), (-2.065, -0.75, 1.6), (0.03, 1.06, 0.86), 0.004),
                 rbox(W, (-2.05, -0.75, 1.6), (0.02, 0.035, 0.88), 0.004),
                 rbox(W, (-2.05, -0.75, 1.6), (0.02, 1.08, 0.035), 0.004)],
      "Cửa sổ", "Ánh sáng tự nhiên giúp quan sát màu da và ban chính xác hơn.")

    # exam bed
    bed = [rbox(W, (0.4, 0.425, 0.355), (1.84, 0.7, 0.05), 0.02),
           rbox(MI, (0.4, 0.425, 0.44), (1.9, 0.75, 0.12), 0.04),
           rbox(W, (0.3, 0.425, 0.502), (1.6, 0.56, 0.01), 0.004),
           rbox(MI, (1.14, 0.425, 0.575), (0.5, 0.72, 0.1), 0.035, rot=(0, -0.38, 0)),
           sphere(W, (1.17, 0.425, 0.69), 0.16, scale=(1.0, 1.6, 0.35), seg=16, rings=8, rot=(0, -0.38, 0))]
    for x in (-0.45, 1.25):
        for y in (0.13, 0.72):
            bed.append(limb(ME, (x, y, 0.0), (x, y, 0.34), 0.025, 0.025))
    P("Exam_Bed", bed, "Giường khám", "Giường khám bọc nệm, trải giấy lót dùng một lần cho mỗi bệnh nhi.")
    P("Step_Stool", [rbox(W, (0.98, -0.28, 0.07), (0.44, 0.3, 0.14), 0.025),
                     rbox(MI, (0.98, -0.28, 0.145), (0.4, 0.26, 0.02), 0.008)],
      "Bậc bước", "Bậc để trẻ và phụ huynh bước lên giường khám.")
    P("Doctor_Stool", [limb(MI, (-0.95, -0.6, 0.44), (-0.95, -0.6, 0.5), 0.17, 0.17, seg=24),
                       limb(ME, (-0.95, -0.6, 0.06), (-0.95, -0.6, 0.44), 0.025),
                       limb(ME, (-0.95, -0.6, 0.03), (-0.95, -0.6, 0.065), 0.2, 0.17, seg=24)],
      "Ghế bác sĩ", "Ghế xoay của bác sĩ, vị trí người học khi hỏi bệnh và khám.")
    P("Desk", [rbox(WD, (-1.72, 0.75, 0.72), (0.7, 1.2, 0.05), 0.015),
               rbox(WD, (-1.72, 0.18, 0.35), (0.64, 0.04, 0.7), 0.01),
               rbox(WD, (-1.72, 1.32, 0.35), (0.64, 0.04, 0.7), 0.01),
               rbox(W, (-1.72, 1.1, 0.52), (0.6, 0.38, 0.3), 0.015),
               sphere(ME, (-1.41, 1.1, 0.52), 0.018, seg=8, rings=6)],
      "Bàn bác sĩ", "Bàn làm việc để ghi bệnh án.")
    P("Computer", [rbox(mat("screen"), (-1.88, 0.75, 1.02), (0.04, 0.52, 0.33), 0.012),
                   rbox(mat("display"), (-1.857, 0.75, 1.02), (0.006, 0.46, 0.27), 0.002),
                   limb(ME, (-1.9, 0.75, 0.75), (-1.9, 0.75, 0.9), 0.02),
                   rbox(ME, (-1.88, 0.75, 0.752), (0.16, 0.2, 0.014), 0.005),
                   rbox(W, (-1.6, 0.75, 0.755), (0.13, 0.38, 0.016), 0.005)],
      "Máy tính", "Máy tính tra cứu hồ sơ bệnh án điện tử.")
    P("Cabinet", [rbox(W, (-0.95, 1.42, 1.6), (0.9, 0.26, 0.7), 0.02),
                  rbox(MI, (-0.95, 1.287, 1.6), (0.008, 0.008, 0.62), 0.002),
                  rbox(mat("coral"), (-0.73, 1.285, 1.74), (0.15, 0.012, 0.045), 0.004),
                  rbox(mat("coral"), (-0.73, 1.283, 1.74), (0.045, 0.012, 0.15), 0.004),
                  sphere(ME, (-0.99, 1.28, 1.5), 0.016, seg=8, rings=6),
                  sphere(ME, (-0.91, 1.28, 1.5), 0.016, seg=8, rings=6)],
      "Tủ thuốc", "Tủ treo tường đựng dụng cụ khám và vật tư y tế.")
    P("Trash_Bin", [limb(W, (-1.1, 1.32, 0.0), (-1.1, 1.32, 0.38), 0.12, 0.135, seg=20),
                    limb(MI, (-1.1, 1.32, 0.38), (-1.1, 1.32, 0.41), 0.142, 0.142, seg=20)],
      "Thùng rác y tế", "Thùng rác có nắp đạp chân.")
    chart = [rbox(mat("sun"), (-0.32, 1.522, 0.85), (0.2, 0.02, 1.5), 0.008)]
    for i in range(14):
        z = 0.2 + i * 0.1
        chart.append(rbox(mat("coral") if i % 5 == 0 else W, (-0.32 + (0.03 if i % 5 else 0), 1.51, z),
                          (0.07 if i % 5 else 0.13, 0.006, 0.012), 0.002))
    chart.append(sphere(mat("coral"), (-0.32, 1.515, 1.66), 0.07, scale=(1, 0.3, 1), seg=14, rings=8))
    P("Height_Chart", chart, "Thước đo chiều cao", "Thước dán tường để đo chiều cao của trẻ.")
    P("Poster", [rbox(W, (0.78, 1.538, 1.72), (0.62, 0.014, 0.46), 0.006),
                 rbox(MI, (0.62, 1.529, 1.74), (0.2, 0.008, 0.06), 0.003),
                 rbox(MI, (0.62, 1.527, 1.74), (0.06, 0.008, 0.2), 0.003),
                 sphere(mat("coral"), (0.88, 1.53, 1.8), 0.045, scale=(1, 0.2, 1), seg=12, rings=6),
                 sphere(mat("sun"), (0.98, 1.53, 1.68), 0.045, scale=(1, 0.2, 1), seg=12, rings=6),
                 sphere(mat("curtain"), (0.86, 1.53, 1.62), 0.045, scale=(1, 0.2, 1), seg=12, rings=6)],
      "Áp phích sức khoẻ", "Áp phích hướng dẫn rửa tay và chăm sóc trẻ.")
    P("Wall_Clock", [limb(W, (1.5, 1.55, 2.08), (1.5, 1.515, 2.08), 0.17, 0.17, seg=28),
                     limb(MI, (1.5, 1.55, 2.08), (1.5, 1.522, 2.08), 0.185, 0.185, seg=28),
                     rbox(mat("screen"), (1.5, 1.511, 2.12), (0.016, 0.006, 0.09), 0.002),
                     rbox(mat("screen"), (1.55, 1.511, 2.08), (0.11, 0.006, 0.012), 0.002)],
      "Đồng hồ", "Đồng hồ treo tường, dùng khi đếm mạch và nhịp thở.")
    P("IV_Stand", [limb(ME, (1.3, 1.2, 0.02), (1.3, 1.2, 0.05), 0.2, 0.17, seg=20),
                   limb(ME, (1.3, 1.2, 0.05), (1.3, 1.2, 1.9), 0.015),
                   rbox(ME, (1.3, 1.2, 1.9), (0.32, 0.016, 0.016), 0.004),
                   rbox(mat("curtain"), (1.43, 1.2, 1.73), (0.12, 0.045, 0.22), 0.02),
                   limb(mat("curtain"), (1.43, 1.2, 1.62), (1.43, 1.2, 1.2), 0.005)],
      "Cây truyền dịch", "Cây treo dịch truyền, dùng khi trẻ cần bù dịch.")
    mon = [limb(ME, (1.72, 0.5, 0.02), (1.72, 0.5, 0.05), 0.2, 0.17, seg=20),
           limb(ME, (1.72, 0.5, 0.05), (1.72, 0.5, 1.15), 0.018),
           rbox(mat("screen"), (1.72, 0.5, 1.3), (0.46, 0.07, 0.33), 0.02),
           rbox(W, (1.72, 0.5, 1.3), (0.5, 0.05, 0.37), 0.03)]
    pts = [(-0.18, 0), (-0.09, 0), (-0.06, 0.08), (-0.025, -0.07), (0.01, 0.04), (0.04, 0), (0.18, 0)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        mon.append(limb(mat("screen_line"), (1.72 + x0, 0.462, 1.3 + z0), (1.72 + x1, 0.462, 1.3 + z1), 0.006,
                        seg=6, round_ends=True))
    P("Monitor", mon, "Máy theo dõi", "Máy theo dõi dấu hiệu sinh tồn: nhịp tim, SpO2.")
    cur = [limb(ME, (1.99, 0.45, 1.97), (1.99, 1.52, 1.97), 0.012)]
    for i in range(11):
        y = 0.52 + i * 0.095
        cur.append(limb(mat("curtain"), (1.99 + (0.02 if i % 2 else -0.02), y, 0.3), (1.99, y, 1.95), 0.062, 0.05, seg=10))
    P("Curtain", cur, "Rèm che", "Rèm che giữ riêng tư cho bệnh nhi khi khám.")
    tb, tl = mat("teddy"), mat("teddy_light")
    tx, ty = 0.72, 0.5
    teddy = [sphere(tb, (tx, ty, 0.585), 0.08, scale=(1, 0.9, 1.05)), sphere(tb, (tx, ty - 0.005, 0.7), 0.066),
             sphere(tl, (tx, ty - 0.058, 0.688), 0.028, scale=(1.1, 0.7, 0.85), seg=10, rings=6),
             sphere(mat("eye_dark"), (tx, ty - 0.078, 0.695), 0.008, seg=8, rings=6),
             sphere(tl, (tx, ty - 0.07, 0.58), 0.04, scale=(1, 0.4, 1.1), seg=10, rings=6)]
    for side in (+1, -1):
        teddy += [sphere(tb, (tx + 0.05 * side, ty, 0.755), 0.026, seg=10, rings=6),
                  sphere(mat("eye_dark"), (tx + 0.026 * side, ty - 0.058, 0.715), 0.008, seg=8, rings=6),
                  sphere(tb, (tx + 0.085 * side, ty - 0.02, 0.6), 0.03, scale=(1, 1, 1.5), seg=10, rings=6, rot=(0, 0.6 * side, 0)),
                  sphere(tb, (tx + 0.05 * side, ty - 0.07, 0.53), 0.034, scale=(1, 1.5, 0.9), seg=10, rings=6)]
    P("Teddy", teddy, "Gấu bông", "Đồ chơi giúp bé bớt sợ khi vào phòng khám.")
    return room


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=False,
                              export_extras=True, export_morph=True, export_skins=True, export_animations=False,
                              export_cameras=False, export_lights=False)


def render_preview(path, loc=(2.5, -4.3, 2.1), target=(0.05, 0.25, 0.85), lens=42, res=(1100, 800)):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.93, 0.96, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for o in sc.objects:
        if o.name.startswith("collider_"):
            o.hide_render = True
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sd = bpy.data.lights.new("sun", "SUN")
    sd.energy = 3.0
    sd.angle = 0.3
    sun = bpy.data.objects.new("sun", sd)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(25))
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun):
        bpy.data.objects.remove(o)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--blend")
    ap.add_argument("--render")
    ap.add_argument("--closeup")
    a = ap.parse_args(sys.argv[1:])
    reset_scene()
    palette()
    build_room()
    build_mother()
    build_child()
    export(a.out)
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=a.blend)
    if a.render:
        render_preview(a.render)
    if a.closeup:
        render_preview(a.closeup, loc=(0.75, -1.9, 1.25), target=(0.07, 0.2, 0.92), lens=50, res=(800, 800))
    print("OK")
