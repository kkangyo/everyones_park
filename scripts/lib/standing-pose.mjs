// Meshy의 기본 자세도 다리가 벌어질 수 있어, 발목을 골반 아래로 옮기는 두 관절 IK.
// 처리 스크립트의 외부 패키지에 three 추가 필요 (npm i --no-save three).
import { Object3D, Vector3, Quaternion } from "three";

export function standingPose(doc) {
  const nodes = doc.getRoot().listNodes(), objects = new Map();
  for (const n of nodes) {
    const o = new Object3D();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    objects.set(n, o);
  }
  for (const n of nodes) for (const child of n.listChildren()) objects.get(n).add(objects.get(child));
  const find = (name) => objects.get(nodes.find(n => n.getName().replace(/^mixamorig:/, "") === name));
  const position = o => o.getWorldPosition(new Vector3());
  const rotation = o => o.getWorldQuaternion(new Quaternion());
  const aim = (joint, child, target) => {
    const p = position(joint), from = position(child).sub(p).normalize(), to = target.clone().sub(p).normalize();
    const world = new Quaternion().setFromUnitVectors(from, to).multiply(rotation(joint));
    joint.quaternion.copy(rotation(joint.parent).invert().multiply(world));
    joint.updateWorldMatrix(false, true);
  };
  for (const side of ["Left", "Right"]) {
    const hip = find(side + "UpLeg"), knee = find(side + "Leg"), foot = find(side + "Foot");
    if (!hip || !knee || !foot) throw new Error("서 있기 보정에 필요한 다리 뼈가 없습니다");
    const h = position(hip), k = position(knee), f = position(foot), footRotation = rotation(foot);
    const target = f.clone(); target.x = h.x;
    const upper = h.distanceTo(k), lower = k.distanceTo(f), distance = h.distanceTo(target);
    if (distance >= upper + lower || distance <= Math.abs(upper - lower)) throw new Error("발목 목표가 다리 길이 밖에 있습니다");
    const axis = target.clone().sub(h).normalize();
    const forward = new Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
    const kneeTarget = h.clone().addScaledVector(axis, along).addScaledVector(forward, bend);
    aim(hip, knee, kneeTarget);
    aim(knee, foot, target);
    // 발 자체의 방향과 바닥 높이는 유지한다.
    foot.quaternion.copy(rotation(foot.parent).invert().multiply(footRotation));
    foot.updateWorldMatrix(false, true);
  }
  return new Map(nodes.filter(n => /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/.test(n.getName().replace(/^mixamorig:/, "")))
    .map(n => [n, { translation: objects.get(n).position.toArray(), rotation: objects.get(n).quaternion.toArray() }]));
}

export function applyStandingPose(doc, animations) {
  const pose = standingPose(doc), buffer = doc.getRoot().listBuffers()[0];
  let count = 0;
  for (const animation of animations) {
    for (const [node, values] of pose) for (const path of ["translation", "rotation"]) {
      let channel = animation.listChannels().find(c => c.getTargetNode() === node && c.getTargetPath() === path);
      if (!channel) {
        channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path);
        animation.addChannel(channel);
      }
      // 다른 동작과 공유할 수 있는 기존 sampler 대신 새 sampler를 만든다.
      const sampler = doc.createAnimationSampler().setInterpolation("LINEAR")
        .setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(buffer))
        .setOutput(doc.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values[path])).setBuffer(buffer));
      animation.addSampler(sampler); channel.setSampler(sampler); count++;
    }
  }
  return count;
}
