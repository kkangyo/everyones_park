# 알파카(Meshy 자동 리깅, 2족 SD 비인간형) 리깅 수정. 표준 라이브러리만 쓴다.
#   python3 scripts/fix-alpaca-rig.py <in.glb> <out.glb>
#   예: python3 scripts/fix-alpaca-rig.py assets/models/Meshy_AI_Cozy_Alpaca_Reference_Texture_20261121_animated_mixamo_All_animation.glb assets/models/Meshy_AI_Cozy_Alpaca_rigfix.glb
# 1. 뼈 정리: 왼손 밑에 붙었는데 머리 속에 있던 Bone_028(머리·귀를 왼팔 따라 끌고 감), 왼손에만 있던 2mm 손가락 뼈 4개를 지운다
# 2. 어깨 뼈를 척추 기준 좌우 대칭으로 옮긴다 (팔 관절 자리와 동작은 그대로)
# 3. 가중치를 위치로 새로 칠한다. 큰 머리·귀는 Head 하나, 몸통·목도리·꼬리는 척추 높이 순, 소매는 팔 축 반지름, 짧은 다리는 높이 순.
#    같은 자리 꼭짓점(UV 이음매로 나뉜 것)은 같은 가중치를 받으니 메시가 벌어지지 않는다
import sys, math
import json,struct
CT={5126:('f',4),5123:('H',2),5121:('B',1),5125:('I',4)}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
    def __init__(s,path):
        f=open(path,'rb').read()
        jl,_=struct.unpack('<II',f[12:20]); s.j=json.loads(f[20:20+jl])
        bl,_=struct.unpack('<II',f[20+jl:28+jl]); s.bin=bytearray(f[28+jl:28+jl+bl])
    def acc(s,i):
        j=s.j;a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
        fmt,sz=CT[a['componentType']]; n=NC[a['type']]
        off=bv.get('byteOffset',0)+a.get('byteOffset',0); st=bv.get('byteStride',sz*n)
        return [struct.unpack_from('<'+fmt*n,s.bin,off+k*st) for k in range(a['count'])]
    def write_acc(s,i,vals):
        j=s.j;a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
        fmt,sz=CT[a['componentType']]; n=NC[a['type']]
        off=bv.get('byteOffset',0)+a.get('byteOffset',0); st=bv.get('byteStride',sz*n)
        for k,v in enumerate(vals): struct.pack_into('<'+fmt*n,s.bin,off+k*st,*v)
    def save(s,path):
        js=json.dumps(s.j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
        b=bytes(s.bin); b+=b'\0'*((4-len(b)%4)%4)
        s.j['buffers'][0]['byteLength']=len(s.bin)
        js=json.dumps(s.j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
        out=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(b))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(b),0x004E4942)+b
        open(path,'wb').write(out)
def qm(q):
    x,y,z,w=q
    return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
def trs(t,r,s=(1,1,1)):
    R=qm(r); return [[R[i][k]*s[k] for k in range(3)]+[t[i]] for i in range(3)]+[[0,0,0,1]]
def mul(A,B): return [[sum(A[i][k]*B[k][jj] for k in range(4)) for jj in range(4)] for i in range(4)]
def apply(M,p): return [sum(M[i][k]*p[k] for k in range(3))+M[i][3] for i in range(3)]
def inv(M):
    # general 4x4 inverse via gauss-jordan
    n=4; A=[row[:]+[1.0 if i==j else 0.0 for j in range(n)] for i,row in enumerate(M)]
    for c in range(n):
        p=max(range(c,n),key=lambda r:abs(A[r][c])); A[c],A[p]=A[p],A[c]
        pv=A[c][c]; A[c]=[x/pv for x in A[c]]
        for r in range(n):
            if r!=c:
                f=A[r][c]; A[r]=[a-f*b for a,b in zip(A[r],A[c])]
    return [row[n:] for row in A]
def colmajor(M): return [M[r][c] for c in range(4) for r in range(4)]
def fromcol(m): return [[m[c*4+r] for c in range(4)] for r in range(4)]

g = GLB(sys.argv[1]); j = g.j; nodes = j['nodes']
short = lambda n: n.get('name', '').replace('mixamorig:', '')
byname = {short(n): i for i, n in enumerate(nodes)}
skin = j['skins'][0]

# ---------- 1. 뼈 정리: 머리 속 Bone_028, 왼손에만 있던 납작한 손가락 뼈 삭제 ----------
REMOVE = {byname[n] for n in ['Bone_028', 'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3', 'LeftHandMiddle4']}
old_joints = skin['joints']
ibm_old = g.acc(skin['inverseBindMatrices'])
keep = [i for i in range(len(nodes)) if i not in REMOVE]
remap = {o: n for n, o in enumerate(keep)}
for n in nodes:
    if 'children' in n:
        n['children'] = [remap[c] for c in n['children'] if c not in REMOVE]
        if not n['children']: del n['children']
j['nodes'] = nodes = [nodes[i] for i in keep]
for sc in j['scenes']: sc['nodes'] = [remap[i] for i in sc['nodes']]
for a in j['animations']:
    chs, sams, smap = [], [], {}
    for ch in a['channels']:
        if ch['target']['node'] in REMOVE: continue
        s = ch['sampler']
        if s not in smap: smap[s] = len(sams); sams.append(a['samplers'][s])
        ch['sampler'] = smap[s]; ch['target']['node'] = remap[ch['target']['node']]; chs.append(ch)
    a['channels'], a['samplers'] = chs, sams
joints = [remap[o] for o in old_joints if o not in REMOVE]
ibm = [ibm_old[k] for k, o in enumerate(old_joints) if o not in REMOVE]
skin['joints'] = joints
byname = {short(n): i for i, n in enumerate(nodes)}
JI = {short(nodes[ji]): k for k, ji in enumerate(joints)}   # 뼈 이름 -> 스킨 joint 번호

# ---------- 2. 어깨 뼈 좌우 맞추기 (왼쪽은 척추 한가운데, 오른쪽은 7cm 아래에 있었다) ----------
par = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []): par[c] = i
def local(i): n = nodes[i]; return trs(n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1]))
def world(i): return mul(world(par[i]), local(i)) if i in par else local(i)
def pos(i): M = world(i); return [M[0][3], M[1][3], M[2][3]]
L, R = byname['LeftShoulder'], byname['RightShoulder']
pl, pr = pos(L), pos(R)
cx = (pos(byname['Spine2'])[0] + pos(byname['Neck'])[0]) / 2   # 척추 x
dx = 0.065; y = (pl[1] + pr[1]) / 2; z = (pl[2] + pr[2]) / 2
targets = {L: [cx + dx, y, z], R: [cx - dx, y, z]}
moved = {}
for sh, tgt in targets.items():
    arm = [c for c in nodes[sh]['children']][0]
    arm_w = pos(arm)
    old_t = nodes[sh]['translation'][:]
    nt = apply(inv(world(par[sh])), tgt)
    nodes[sh]['translation'] = nt
    na = apply(inv(world(sh)), arm_w)          # 팔 관절 자리는 그대로
    old_a = nodes[arm]['translation'][:]
    nodes[arm]['translation'] = na
    moved[sh] = (old_t, nt); moved[arm] = (old_a, na)
    ibm[JI[short(nodes[sh])]] = tuple(colmajor(inv(world(sh))))
for a in j['animations']:
    for ch in a['channels']:
        n = ch['target']['node']
        if ch['target']['path'] == 'translation' and n in moved:
            o, nw = moved[n]; acc_i = a['samplers'][ch['sampler']]['output']
            vals = g.acc(acc_i)
            g.write_acc(acc_i, [tuple(v[k] - o[k] + nw[k] for k in range(3)) for v in vals])
            mn = [min(v[k] for v in g.acc(acc_i)) for k in range(3)]; mx = [max(v[k] for v in g.acc(acc_i)) for k in range(3)]
            j['accessors'][acc_i]['min'], j['accessors'][acc_i]['max'] = mn, mx
# IBM: 같은 자리에 개수만 줄여 다시 쓴다
ia = j['accessors'][skin['inverseBindMatrices']]; ia['count'] = len(ibm)
g.write_acc(skin['inverseBindMatrices'], ibm)

# ---------- 3. 가중치 새로 칠하기 ----------
B = {k: pos(byname[k]) for k in JI}
def sm(a, b, t):
    if a == b: return 1.0 if t >= a else 0.0
    t = max(0.0, min(1.0, (t - a) / (b - a))); return t * t * (3 - 2 * t)
def lerp_chain(t, pts):
    """pts = [(값, 뼈이름)...] 오름차순. t 위치에서 이웃 두 뼈로 나눈 가중치"""
    if t <= pts[0][0]: return {pts[0][1]: 1.0}
    for (a, na), (b, nb) in zip(pts, pts[1:]):
        if t <= b:
            u = sm(a, b, t); d = {na: 1 - u}; d[nb] = d.get(nb, 0) + u; return d   # 같은 뼈 구간은 합친다
    return {pts[-1][1]: 1.0}
def add(d, e, s):
    for k, v in e.items(): d[k] = d.get(k, 0) + v * s

# 좌우 평균으로 만든 대칭 기준점
def sym(nm):
    l, r = B['Left' + nm], B['Right' + nm]
    return [(l[0] - r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2]
ARM, ELB, WRI = sym('Arm'), sym('ForeArm'), sym('Hand')
HIPJ, KNEE, ANK, TOE = sym('UpLeg'), sym('Leg'), sym('Foot'), sym('ToeBase')
yH, ySp, ySp1, ySp2, yNk, yHd = (B[k][1] for k in ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'])
print('arm', [round(v, 3) for v in ARM], 'elbow', [round(v, 3) for v in ELB], 'wrist', [round(v, 3) for v in WRI])

def arm_axis_y(ax):
    if ax < ELB[0]: u = (ax - ARM[0]) / (ELB[0] - ARM[0]); return ARM[1] + u * (ELB[1] - ARM[1]), ARM[2] + u * (ELB[2] - ARM[2])
    u = (ax - ELB[0]) / (WRI[0] - ELB[0]); return ELB[1] + u * (WRI[1] - ELB[1]), ELB[2] + u * (WRI[2] - ELB[2])

def weights(p):
    x, yv, zv = p; ax = abs(x); side = 'Left' if x > 0 else 'Right'
    w = {}
    # 머리: 목(Neck)~머리 관절 사이에서 넘어가고 그 위는 머리 하나 (큰 머리·귀는 단단하게)
    head = sm(yNk + 0.02, yHd + 0.03, yv)
    # 팔: 팔 축에서 가까운(단면 반지름) 바깥쪽 꼭짓점
    ay, az = arm_axis_y(min(ax, WRI[0] + 0.2))
    # 소매는 축에서 18cm 까지 부푼다. 축 위쪽은 어깨에 걸친 목도리가 있어 좁게 본다
    dy = yv - ay
    r = math.hypot(dy * (1.5 if dy > 0 else 1.0), zv - az)
    armness = sm(ARM[0] - 0.07, ARM[0] + 0.05, ax) * (1 - sm(0.17, 0.22, r))
    # 몸통 옆선(|x| 0.43) 바깥은 소매 높이(머리 아래, 코트 밑자락 위)면 전부 팔
    armness = max(armness, sm(0.41, 0.44, ax) * sm(0.53, 0.57, yv) * (1 - sm(0.93, 0.97, yv))) * (1 - head)
    # 다리: 코트 자락(엉덩이 관절 위) 아래, 꼬리(뒤쪽) 제외
    legness = (1 - sm(HIPJ[1] - 0.04, HIPJ[1] + 0.05, yv)) * (1 - sm(0.22, 0.30, -zv))
    # 가랑이 위쪽 가운데는 엉덩이를 따라간다 (양 허벅지에 반씩 붙으면 다리가 벌어질 때 막처럼 늘어나 찢어져 보인다)
    legness *= 1 - (1 - sm(0.03, 0.11, ax)) * sm(0.17, 0.25, yv)
    body = max(0.0, 1 - head - armness - legness)
    if head > 0:
        add(w, {'Head': 1.0}, head)
    if armness > 0:
        add(w, lerp_chain(ax, [(ARM[0] + 0.02, side + 'Arm'), (ELB[0] - 0.03, side + 'Arm'), (ELB[0] + 0.04, side + 'ForeArm'),
                               (WRI[0] - 0.02, side + 'ForeArm'), (WRI[0] + 0.05, side + 'Hand')]), armness)
    if legness > 0:
        # 사타구니 가운데는 양쪽 허벅지에 반씩
        sL = sm(-0.05, 0.05, x)
        chain = lerp_chain(-yv, [(-(HIPJ[1] - 0.02), 'UpLeg'), (-(KNEE[1] + 0.03), 'UpLeg'), (-(KNEE[1] - 0.03), 'Leg'),
                                 (-(ANK[1] + 0.035), 'Leg'), (-(ANK[1] + 0.005), 'Foot')])
        if 'Foot' in chain:   # 발굽 앞쪽은 발가락 뼈
            f = chain.pop('Foot'); t = sm(TOE[2] - 0.05, TOE[2] + 0.01, zv)
            chain['Foot'] = f * (1 - t); chain['ToeBase'] = f * t
        for k, v in chain.items():
            add(w, {'Left' + k: sL, 'Right' + k: 1 - sL}, v * legness)
    if body > 0:
        spine = lerp_chain(yv, [(yH + 0.04, 'Hips'), (ySp, 'Spine'), (ySp1, 'Spine1'), (ySp2, 'Spine2'), (yNk + 0.02, 'Neck')])
        # 어깨 윗부분은 쇄골(Shoulder) 뼈가 조금 들어 준다
        shl = 0.45 * sm(0.10, ARM[0] - 0.02, ax) * sm(ySp2 - 0.08, ySp2 + 0.02, yv) * (1 - sm(yNk - 0.03, yNk + 0.03, yv))
        add(w, spine, body * (1 - shl)); add(w, {side + 'Shoulder': 1.0}, body * shl)
    return w

prim = j['meshes'][0]['primitives'][0]
P = g.acc(prim['attributes']['POSITION'])
NJ, NW = [], []
for p in P:
    w = sorted(((v, k) for k, v in weights(p).items() if v > 1e-4), reverse=True)[:4]
    s = sum(v for v, _ in w)
    w = [(v / s, k) for v, k in w]
    while len(w) < 4: w.append((0.0, w[0][1]))
    NJ.append(tuple(JI[k] for _, k in w)); NW.append(tuple(v for v, _ in w))
g.write_acc(prim['attributes']['JOINTS_0'], NJ)
g.write_acc(prim['attributes']['WEIGHTS_0'], NW)
# ---------- 4. 걸음 11자: 동작 중 다리를 서 있을 때 너비로 벌린다 ----------
# 서 있는 자세는 무릎·발목이 x ±0.149 인데, Mixamo 걷기·달리기는 다리를 엉덩이 관절(±0.07) 바로 밑으로 곧게 내려
# 통통한 바지·발굽이 가운데서 겹쳐 X 자로 걷는 것처럼 보인다. 키마다 허벅지·정강이를 앞뒤 축(z)으로 돌려
# 무릎·발목을 서 있을 때의 x 로 옮기고, 발은 원래 동작의 방향(발바닥 수평)을 유지하며, 다리가 벌어져 뜬 만큼 골반을 내린다.
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return [w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2]
def qinv(q): return [-q[0], -q[1], -q[2], q[3]]
def qnorm(q): n = math.sqrt(sum(v * v for v in q)); return [v / n for v in q]
HIPS = byname['Hips']
rest_hips_x = pos(HIPS)[0]
REST_ANKLE = {s: pos(byname[s + 'Foot'])[0] - rest_hips_x for s in ('Left', 'Right')}
for a in j['animations']:
    ch = {(c['target']['node'], c['target']['path']): a['samplers'][c['sampler']] for c in a['channels']}
    vals = {k: [list(v) for v in g.acc(s['output'])] for k, s in ch.items()}
    nkey = len(next(iter(vals.values())))
    for k in range(nkey):
        T = {i: list(n.get('translation', [0, 0, 0])) for i, n in enumerate(nodes)}
        Rq = {i: list(n.get('rotation', [0, 0, 0, 1])) for i, n in enumerate(nodes)}
        for (nid, path), v in vals.items():
            if path == 'translation': T[nid] = v[k]
            elif path == 'rotation': Rq[nid] = v[k]
        def wq(i): return qmul(wq(par[i]), Rq[i]) if i in par else Rq[i]
        def wm(i): M = trs(T[i], Rq[i]); return mul(wm(par[i]), M) if i in par else M
        def wp(i): M = wm(i); return [M[0][3], M[1][3], M[2][3]]
        hx = wp(HIPS)[0]
        def swing(bone, tip, tx):
            """bone 을 자기 관절에서 앞뒤 축(z)으로 돌려 tip 의 x 를 tx 로"""
            o, t = wp(bone), wp(tip)
            vx, vy = t[0] - o[0], t[1] - o[1]; L = math.hypot(vx, vy)
            if L < 1e-6: return
            th = math.asin(max(-0.95, min(0.95, (tx - o[0]) / L))) - math.atan2(vx, -vy)
            rz = [0, 0, math.sin(th / 2), math.cos(th / 2)]
            Rq[bone] = qnorm(qmul(qinv(wq(par[bone])), qmul(rz, wq(bone))))
        lift = {}
        for s in ('Left', 'Right'):
            up, leg, foot = byname[s + 'UpLeg'], byname[s + 'Leg'], byname[s + 'Foot']
            old_y, q_leg_w, q_foot_w = wp(foot)[1], wq(leg), wq(foot)
            swing(up, leg, hx + REST_ANKLE[s])                # 무릎을 서 있을 때 발 너비로
            Rq[leg] = qnorm(qmul(qinv(wq(up)), q_leg_w))       # 정강이는 원래 방향 그대로 옆으로만 (발 차올림 높이 유지)
            Rq[foot] = qnorm(qmul(qinv(wq(leg)), q_foot_w))   # 발 방향도 원래대로 (발바닥 수평)
            for n in (up, leg, foot): vals[(n, 'rotation')][k] = Rq[n]
            lift[s] = (old_y, wp(foot)[1])
        stance = min(lift, key=lambda s: lift[s][0])         # 땅을 딛는 발(원래 더 낮은 발)이 원래 높이에 오게
        vals[(HIPS, 'translation')][k][1] -= lift[stance][1] - lift[stance][0]
    for key in [(byname[s + n], 'rotation') for s in ('Left', 'Right') for n in ('UpLeg', 'Leg', 'Foot')] + [(HIPS, 'translation')]:
        acc_i = ch[key]['output']; g.write_acc(acc_i, [tuple(v) for v in vals[key]])
        A = j['accessors'][acc_i]
        if 'min' in A: A['min'] = [min(v[d] for v in vals[key]) for d in range(len(A['min']))]; A['max'] = [max(v[d] for v in vals[key]) for d in range(len(A['max']))]

# ---------- 5. 털 색: 따뜻한 베이지 -> 살짝 흰 크림 ----------
# 털 부위(머리·귀, 코트 밑 다리, 꼬리)의 텍스처만 고친다. 코트 밑단·소매 끝 흰 털 장식, 목도리, 발굽, 볼·귀 안 분홍, 눈·코는 그대로.
# 메시 위치로 털 삼각형을 골라 UV 마스크를 그리고, 그 안에서 따뜻한 크림색 화소만 채도를 줄이고 밝기를 올린다.
# PNG 풀기·묶기는 macOS sips 를 쓴다.
FUR_CHROMA = 0.45   # 남길 채도 (1 = 그대로)
FUR_LIFT = 0.35     # 흰색 쪽으로 올릴 밝기 비율
import subprocess, tempfile, os
def recolor_fur():
    prim = j['meshes'][0]['primitives'][0]
    P = g.acc(prim['attributes']['POSITION']); UV = g.acc(prim['attributes']['TEXCOORD_0'])
    idx = [i[0] for i in g.acc(prim['indices'])]
    def fur(p):
        x, yv, zv = p
        if yv > 0.93: return True                          # 머리·귀 (목도리는 노란색이라 아래 색 검사에서 빠진다)
        if yv < 0.295 and abs(x) < 0.42: return True       # 코트 밑 다리
        return zv < -0.30 and 0.2 < yv < 0.55 and abs(x) < 0.2   # 꼬리
    isfur = [fur(p) for p in P]
    M = 1024; mask = bytearray(M * M)
    for t in range(0, len(idx), 3):
        a, b, c = idx[t:t + 3]
        if not (isfur[a] and isfur[b] and isfur[c]): continue
        A, B, C = [(UV[i][0] * M, UV[i][1] * M) for i in (a, b, c)]
        area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])
        if abs(area) < 1e-12: continue
        for yy in range(max(0, int(min(A[1], B[1], C[1])) - 1), min(M, int(max(A[1], B[1], C[1])) + 2)):
            for xx in range(max(0, int(min(A[0], B[0], C[0])) - 1), min(M, int(max(A[0], B[0], C[0])) + 2)):
                px, py = xx + 0.5, yy + 0.5
                w0 = ((B[0] - px) * (C[1] - py) - (C[0] - px) * (B[1] - py)) / area
                w1 = ((C[0] - px) * (A[1] - py) - (A[0] - px) * (C[1] - py)) / area
                if w0 >= -0.02 and w1 >= -0.02 and w0 + w1 <= 1.02: mask[yy * M + xx] = 1
    for _ in range(2):   # 조각 가장자리(밉맵 번짐 자리)까지 두 칸 넓힌다
        m2 = bytearray(mask)
        for yy in range(1, M - 1):
            r = yy * M
            for xx in range(1, M - 1):
                if not mask[r + xx] and (mask[r + xx - 1] or mask[r + xx + 1] or mask[r - M + xx] or mask[r + M + xx]): m2[r + xx] = 1
        mask = m2
    img = j['images'][0]; bv = j['bufferViews'][img['bufferView']]
    tmp = tempfile.mkdtemp()
    src, bmp, out = os.path.join(tmp, 'a.png'), os.path.join(tmp, 'a.bmp'), os.path.join(tmp, 'b.png')
    open(src, 'wb').write(g.bin[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']])
    subprocess.run(['sips', '-s', 'format', 'bmp', src, '--out', bmp], check=True, capture_output=True)
    d = bytearray(open(bmp, 'rb').read())
    off = struct.unpack_from('<I', d, 10)[0]; W, H = struct.unpack_from('<ii', d, 18); bpp = struct.unpack_from('<H', d, 28)[0] // 8
    row = ((W * bpp + 3) // 4) * 4; AH = abs(H); changed = 0
    for y in range(AH):
        v = (AH - 1 - y) if H > 0 else y          # 텍스처 위에서부터 v 줄
        mr = (v * M // AH) * M
        base = off + y * row
        for x in range(W):
            if not mask[mr + x * M // W]: continue
            o = base + x * bpp
            bl, gr, rd = d[o], d[o + 1], d[o + 2]
            mx, mn = max(rd, gr, bl), min(rd, gr, bl)
            # 따뜻한 크림(빨강 >= 초록 >= 파랑, 너무 어둡지 않음)만. 분홍(초록 < 파랑 근처)·갈색 눈코(어두움)는 뺀다
            if not (rd >= gr >= bl and mx > 90 and mx - mn > 8 and (gr - bl) >= 0.35 * (rd - bl)): continue
            k = min(1.0, (mx - 90) / 40)          # 어두운 쪽은 덜 바꿔 경계를 부드럽게
            L = 0.299 * rd + 0.587 * gr + 0.114 * bl
            L2 = L + (255 - L) * FUR_LIFT
            nr, ng, nb = (L2 + (c - L) * FUR_CHROMA for c in (rd, gr, bl))
            d[o + 2] = max(0, min(255, round(rd + (nr - rd) * k)))
            d[o + 1] = max(0, min(255, round(gr + (ng - gr) * k)))
            d[o] = max(0, min(255, round(bl + (nb - bl) * k)))
            changed += 1
    open(bmp, 'wb').write(d)
    subprocess.run(['sips', '-s', 'format', 'png', bmp, '--out', out], check=True, capture_output=True)
    png_bytes = open(out, 'rb').read()
    # 버퍼를 bufferView 순서대로 다시 붙인다 (이미지 길이가 달라지므로)
    views = sorted(range(len(j['bufferViews'])), key=lambda i: j['bufferViews'][i].get('byteOffset', 0))
    nb = bytearray()
    for i in views:
        v = j['bufferViews'][i]
        data = png_bytes if i == img['bufferView'] else bytes(g.bin[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        nb += b'\0' * ((4 - len(nb) % 4) % 4)
        v['byteOffset'] = len(nb); v['byteLength'] = len(data); nb += data
    g.bin = nb
    print('fur texels recolored', changed)
recolor_fur()

g.save(sys.argv[2])
print('saved', sys.argv[2], 'joints', len(joints))
