"""Pose the right hand of the Blender character in a squash grip and place the racket in it.

Run inside Blender (scene: squash-assets.blend) after build_kit.py. The handle runs across
the palm at GRIP_ANGLE above the knuckle line (toward the thumb side), the fingers wrap a
cylinder of R_HANDLE around it, the thumb lies along the top bevel toward the head and the
butt sits just outside the heel of the hand (see docs/design/character-brief.md, "Grip").
The resulting butt position in the palm frame is printed; copy it to GRIP_BUTT in
src/render3d/skinned-player.js when the hand or the angle changes.
"""
import bpy, math
import numpy as np
from mathutils import Vector, Quaternion, Matrix

GRIP_ANGLE = math.radians(18)
R_HANDLE = 0.0135           # grip radius
FINGER_HALF = 0.0055        # finger half-thickness: the bones wrap R_HANDLE + FINGER_HALF
SINK = 0.003                # how far the grip presses into the palm pad
L_EDGE = -0.047             # pinky-side edge of the hand in the palm frame
RENDER_DIR = r'C:\claude\squash-game\docs\design'

rig = bpy.data.objects['PlayerRig']; racket = bpy.data.objects['Racket']; body = bpy.data.objects['PlayerBody']
B = rig.data.bones; P = rig.pose.bones
hips = B['mixamorig:Hips'].head_local


def hand_frame(side):
    """(hand bone, finger direction, lateral toward the thumb, palm normal) in armature space."""
    hand = B[f'mixamorig:{side}Hand']
    d0 = (hand.tail_local - hand.head_local).normalized()
    th = B[f'mixamorig:{side}HandThumb1'].head_local - hand.head_local
    L0 = (th - d0 * th.dot(d0)).normalized()
    n0 = d0.cross(L0).normalized()
    if n0.dot(hips - hand.head_local) < 0: n0 = -n0      # the palm faces the body in the rest pose
    return hand, d0, L0, n0


def local(pb, axis_w): return pb.bone.matrix_local.to_3x3().inverted() @ axis_w


def aim(pb, target_w):
    """Rotate a pose bone (on top of its parents' pose) so it points along target_w."""
    bpy.context.view_layer.update()
    m = pb.matrix.copy(); cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = cur.rotation_difference(target_w.normalized()).to_matrix()
    nm = (rot @ m.to_3x3()).to_4x4(); nm.translation = m.translation; pb.matrix = nm


def flex_axis(bone, n0):
    fdir = (bone.tail_local - bone.head_local).normalized(); axis = fdir.cross(n0).normalized()
    test = fdir.copy(); test.rotate(Quaternion(axis, 0.5))
    return axis if test.dot(n0) > 0 else -axis


def rot2(v, a): return np.array([math.cos(a) * v[0] - math.sin(a) * v[1], math.sin(a) * v[0] + math.cos(a) * v[1]])


for pb in P:
    if 'Hand' in pb.name and pb.name not in ('mixamorig:RightHand', 'mixamorig:LeftHand'):
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = Quaternion()
bpy.context.view_layer.update()

# ---- right hand
hand, d0, L0, n0 = hand_frame('Right')
def rel(v):
    r = v - hand.head_local; return np.array([r.dot(L0), r.dot(d0), r.dot(n0)])
# palm surface height above the bone plane, from the body vertices over the palm centre
n_palm = max(rel(v.co)[2] for v in body.data.vertices
             if (lambda r: abs(r[0]) < 0.015 and 0.04 < r[1] < 0.09 and -0.05 < r[2] < 0.08)(rel(v.co)))
R_EFF = R_HANDLE + FINGER_HALF
h2 = np.array([math.cos(GRIP_ANGLE), math.sin(GRIP_ANGLE), 0.0])        # handle axis in the palm frame (lateral, fingers, out)
idx_mcp = rel(B['mixamorig:RightHandIndex1'].head_local)
c_idx = np.array([idx_mcp[0], idx_mcp[1] - 0.012, n_palm + R_HANDLE - SINK])   # axis point under the index knuckle
def axis_point(L): return c_idx + h2 * ((L - c_idx[0]) / h2[0])

splay = {'Index': -0.1, 'Middle': -0.03, 'Ring': 0.03, 'Pinky': 0.1}
limits = (math.radians(95), math.radians(108), math.radians(90)); mins = (0.0, math.radians(40), math.radians(40))
report = {}
for finger in ('Index', 'Middle', 'Ring', 'Pinky'):
    bones = [B[f'mixamorig:RightHand{finger}{j}'] for j in (1, 2, 3)]
    heads = [rel(b.head_local) for b in bones] + [rel(bones[2].tail_local)]
    C = axis_point(heads[0][0])[1:]                      # circle centre in this finger's (fingers, out) plane
    J = heads[0][1:].copy(); prev_world = 0.0; angs = []
    for k in range(3):
        seg = heads[k + 1] - heads[k]; length = float(np.hypot(seg[1], seg[2])); phi_rest = math.atan2(seg[2], seg[1])
        v = C - J; rho = float(np.hypot(*v)); vhat = v / max(rho, 1e-6)
        t_len = math.sqrt(max(rho * rho - R_EFF * R_EFF, 0.0))
        if rho <= R_EFF + 1e-4 or length > t_len:
            # the segment reaches the circle: end it on the circle (chord)
            cg = (length * length + rho * rho - R_EFF * R_EFF) / (2 * length * rho); gamma = math.acos(max(-1.0, min(1.0, cg)))
        else:
            gamma = math.asin(min(1.0, R_EFF / rho))      # tangent toward the circle
        dirv = rot2(vhat, -gamma); psi = math.atan2(dirv[1], dirv[0])
        world = psi - phi_rest
        while world < -math.pi: world += 2 * math.pi
        while world > math.pi: world -= 2 * math.pi
        loc = max(mins[k], min(limits[k], world - prev_world)); world = prev_world + loc; psi = world + phi_rest
        angs.append(round(math.degrees(loc), 1))
        J = J + length * np.array([math.cos(psi), math.sin(psi)]); prev_world = world
        pb = P[f'mixamorig:RightHand{finger}{k + 1}']
        q = Quaternion(local(pb, flex_axis(bones[k], n0)), loc)
        if k == 0: q = q @ Quaternion(local(pb, n0), splay[finger])
        pb.rotation_quaternion = q
    report[finger] = angs
h_w = (L0 * h2[0] + d0 * h2[1]).normalized()
c_idx_w = hand.head_local + L0 * c_idx[0] + d0 * c_idx[1] + n0 * c_idx[2]
# thumb: the metacarpal climbs onto the handle from the wrist side, then the thumb lies along the handle toward the head
aim(P['mixamorig:RightHandThumb1'], d0 * 0.7 + n0 * 0.6 + L0 * 0.1)
aim(P['mixamorig:RightHandThumb2'], h_w * 0.85 + n0 * 0.45)
aim(P['mixamorig:RightHandThumb3'], h_w * 0.95 - n0 * 0.3)

# ---- left hand: relaxed
hand_l, d0l, L0l, n0l = hand_frame('Left')
for finger, angs in {'Index': (20, 25, 15), 'Middle': (23, 30, 18), 'Ring': (26, 32, 18), 'Pinky': (30, 32, 18)}.items():
    for j, deg in enumerate(angs, start=1):
        pb = P[f'mixamorig:LeftHand{finger}{j}']; pb.rotation_quaternion = Quaternion(local(pb, flex_axis(pb.bone, n0l)), math.radians(deg))
for j, deg in enumerate((8, 12, 8), start=1):
    pb = P[f'mixamorig:LeftHandThumb{j}']; pb.rotation_quaternion = Quaternion(local(pb, flex_axis(pb.bone, n0l)), math.radians(deg))

# ---- racket: local -Z along the handle toward the head, local -Y = string normal = palm normal, origin = butt
butt_w = c_idx_w - h_w * ((c_idx[0] - L_EDGE) / h2[0] + 0.012)
z_axis = -h_w; y_axis = -n0; x_axis = y_axis.cross(z_axis).normalized(); y_axis = z_axis.cross(x_axis).normalized()
racket.matrix_world = Matrix.Translation(butt_w) @ Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
bpy.context.view_layer.update()

# ---- renders from the palm side, the back of the hand and along the handle
scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = 800; scene.render.resolution_y = 800
cam = bpy.data.objects['PreviewCam']; cam.data.lens = 70
def look(pos, target):
    d = (target - pos).normalized(); zc = -d; xc = Vector((0, 0, 1)).cross(zc).normalized(); yc = zc.cross(xc)
    cam.matrix_world = Matrix((xc, yc, zc)).transposed().to_4x4(); cam.matrix_world.translation = pos
c = c_idx_w - h_w * 0.04
look(c + n0 * 0.42 - d0 * 0.05, c); scene.render.filepath = RENDER_DIR + r'\grip-a.png'; bpy.ops.render.render(write_still=True)
look(c + h_w * 0.38 + n0 * 0.12 + d0 * 0.12, c); scene.render.filepath = RENDER_DIR + r'\grip-c.png'; bpy.ops.render.render(write_still=True)
result = {'GRIP_BUTT (lat, fwd, out)': np.round(rel(butt_w), 4).tolist(), 'n_palm': round(n_palm, 4), 'finger_angles_deg': report}
print(result)
