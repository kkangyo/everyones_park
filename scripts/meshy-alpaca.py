# 알파카(리깅 수정본, scripts/fix-alpaca-rig.py 결과)를 게임용 인형 GLB 로 (docs/meshy-character.md 6).
#   python3 scripts/meshy-alpaca.py assets/models/Meshy_AI_Cozy_Alpaca_rigfix.glb assets/models/meshy-alpaca.glb
# 1. 뼈 이름의 mixamorig: 를 뗀다 (게임 코드가 Head · LeftArm 같은 이름으로 찾는다)
# 2. 동작: 걷기(Walking, 11자 보정됨) = walk. 달리기는 게임이 안 써서 버린다.
#    idle · sit 은 펭귄처럼 기본(T) 자세에서 뼈를 돌려 만든다. wave 는 없다 (게임이 팔 뼈를 돌려 흔든다, DOLL_BONE_WAVE)
# 3. 텍스처 2048 PNG -> 1024 JPEG (macOS sips), 안 쓰는 데이터는 버린다
# 표준 라이브러리만 쓴다. 뼈 단위는 m (다른 Meshy 인형은 cm) -> 게임 DOLL_KINDS.alpaca.boneUnit = 1
import sys, json, struct, math, subprocess, tempfile, os

IN, OUT = sys.argv[1], sys.argv[2]
f = open(IN, 'rb').read()
jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl])
bl = struct.unpack_from('<I', f, 20 + jl)[0]; BIN = f[28 + jl:28 + jl + bl]
CT = {5126: ('f', 4), 5123: ('H', 2), 5121: ('B', 1), 5125: ('I', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    fmt, sz = CT[a['componentType']]; n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', sz * n)
    return [struct.unpack_from('<' + fmt * n, BIN, off + k * st) for k in range(a['count'])]

# 새 버퍼: 쓰는 bufferView 만 옮겨 담고, 새 동작 데이터는 뒤에 붙인다
out_bin = bytearray(); new_views = []
def put_view(data, target=None):
    global out_bin
    out_bin += b'\0' * ((4 - len(out_bin) % 4) % 4)
    v = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}
    if target: v['target'] = target
    out_bin += data; new_views.append(v); return len(new_views) - 1
new_accs = []
def put_acc(vals, typ, minmax=False):
    n = NC[typ]; flat = [x for v in vals for x in (v if isinstance(v, (list, tuple)) else [v])]
    a = {'bufferView': put_view(struct.pack('<%df' % len(flat), *flat)), 'componentType': 5126, 'count': len(vals), 'type': typ}
    if minmax:
        a['min'] = [min(flat[i::n]) for i in range(n)]; a['max'] = [max(flat[i::n]) for i in range(n)]
    new_accs.append(a); return len(new_accs) - 1
view_map, acc_map = {}, {}
def keep_acc(i):
    if i in acc_map: return acc_map[i]
    a = dict(j['accessors'][i]); bv = a['bufferView']
    if bv not in view_map:
        v = j['bufferViews'][bv]; o = v.get('byteOffset', 0)
        view_map[bv] = put_view(BIN[o:o + v['byteLength']], v.get('target'))
        if 'byteStride' in v: new_views[view_map[bv]]['byteStride'] = v['byteStride']
    a['bufferView'] = view_map[bv]; new_accs.append(a); acc_map[i] = len(new_accs) - 1; return acc_map[i]

# ---------- 1. 이름 ----------
nodes = j['nodes']
for n in nodes:
    if 'name' in n: n['name'] = n['name'].replace('mixamorig:', '')
B = {n['name']: i for i, n in enumerate(nodes)}
par = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
joints = j['skins'][0]['joints']

# ---------- 2. 동작 만들기 ----------
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return [w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2]
def qinv(q): return [-q[0], -q[1], -q[2], q[3]]
def qaxis(ax, ang): s = math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, math.cos(ang / 2)]
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
REST_R = {i: list(n.get('rotation', [0, 0, 0, 1])) for i, n in enumerate(nodes)}
REST_T = {i: list(n.get('translation', [0, 0, 0])) for i, n in enumerate(nodes)}
R = {}
def wq(i): return qmul(wq(par[i]), R[i]) if i in par else R[i]
def turn(name, axis, ang):
    """뼈를 인형 기준 축(+x 왼쪽 · +y 위 · +z 앞)으로 ang 만큼 더 돌린다 (부모 뼈부터 차례로)"""
    i = B[name]; p = wq(par[i])
    R[i] = qmul(qmul(qmul(qinv(p), qaxis(axis, ang)), p), R[i])
TAU = math.pi * 2
# 기본 자세는 T 자세(위팔이 수평에서 22° 아래). 서 있을 때 위팔 65°·아래팔 80° 쯤 내려 몸 옆에 (걷기 동작은 위팔 72°)
ARM_DOWN, FORE_DOWN = 0.75, 0.26
def arms(drop=0.0, fwd=0.0):
    turn('LeftArm', Z, -(ARM_DOWN + drop)); turn('RightArm', Z, ARM_DOWN + drop)
    if fwd: turn('LeftArm', X, -fwd); turn('RightArm', X, -fwd)
    turn('LeftForeArm', Z, -FORE_DOWN); turn('RightForeArm', Z, FORE_DOWN)
POSES = {
    # 서 있기: 숨쉬듯 몸을 살짝 펴고, 큰 머리를 천천히 갸웃, 팔을 아주 조금 들썩
    'idle': {'dur': 3.2, 'pose': lambda t: (
        turn('Spine', X, -0.02 * math.sin(TAU * t / 3.2)),
        turn('Head', Z, 0.05 * math.sin(TAU * t / 3.2)),
        arms(-0.04 * max(0.0, math.sin(TAU * t / 1.6))))},
    # 앉기: 허벅지를 앞으로 들어 짧은 다리를 내밀고, 정강이는 조금 내려 발을 번갈아 까딱인다. 팔은 몸 옆에 조금 앞으로
    'sit': {'dur': 3.2, 'pose': lambda t: (
        turn('Head', Z, 0.04 * math.sin(TAU * t / 3.2)),
        arms(-0.05, 0.25),
        [(turn(s + 'UpLeg', X, -1.35), turn(s + 'Leg', X, 0.55),
          turn(s + 'Foot', X, 0.5 + 0.15 * math.sin(TAU * (t / 1.6 + ph)))) for s, ph in (('Left', 0), ('Right', 0.5))])},
}
FPS = 30
anims = []
for a in j['animations']:
    if a['name'] != 'Walking': continue          # 달리기는 버린다
    a = dict(a); a['name'] = 'walk'
    a['samplers'] = [dict(s, input=keep_acc(s['input']), output=keep_acc(s['output'])) for s in a['samplers']]
    anims.append(a)
for name, P in POSES.items():
    n = round(P['dur'] * FPS) + 1; times = [k / FPS for k in range(n)]
    rots = {ji: [] for ji in joints}
    for t in times:
        R.clear(); R.update({i: list(q) for i, q in REST_R.items()})
        P['pose'](t)
        for ji in joints: rots[ji].append(R[ji])
    tin = put_acc(times, 'SCALAR', minmax=True)
    ch, sa = [], []
    for ji in joints:
        sa.append({'input': tin, 'output': put_acc(rots[ji], 'VEC4'), 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sa) - 1, 'target': {'node': ji, 'path': 'rotation'}})
    sa.append({'input': tin, 'output': put_acc([REST_T[B['Hips']]] * n, 'VEC3'), 'interpolation': 'LINEAR'})
    ch.append({'sampler': len(sa) - 1, 'target': {'node': B['Hips'], 'path': 'translation'}})
    anims.append({'name': name, 'channels': ch, 'samplers': sa})
    print('동작', name, P['dur'], '초')
j['animations'] = anims

# ---------- 메시 · 스킨 ----------
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: keep_acc(v) for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = keep_acc(p['indices'])
for s in j['skins']: s['inverseBindMatrices'] = keep_acc(s['inverseBindMatrices'])

# ---------- 3. 텍스처: 1024 JPEG ----------
img = j['images'][0]; v = j['bufferViews'][img['bufferView']]
tmp = tempfile.mkdtemp(); src, dst = os.path.join(tmp, 'a.png'), os.path.join(tmp, 'a.jpg')
open(src, 'wb').write(BIN[v['byteOffset']:v['byteOffset'] + v['byteLength']])
subprocess.run(['sips', '-Z', '1024', '-s', 'format', 'jpeg', '-s', 'formatOptions', '88', src, '--out', dst], check=True, capture_output=True)
img['bufferView'] = put_view(open(dst, 'rb').read()); img['mimeType'] = 'image/jpeg'

j['accessors'], j['bufferViews'] = new_accs, new_views
out_bin += b'\0' * ((4 - len(out_bin) % 4) % 4)
j['buffers'] = [{'byteLength': len(out_bin)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(OUT, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(out_bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js
                      + struct.pack('<II', len(out_bin), 0x004E4942) + out_bin)
print('저장:', OUT, os.path.getsize(OUT), 'bytes')
