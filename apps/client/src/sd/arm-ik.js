// Two-bone arm solver. The grip is the effector so the food stays attached to
// the hand, including each doll's wrist/finger offset.
export function createArmIK(THREE, root, upper, lower, grip, side) {
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), end = new THREE.Vector3();
  const target = new THREE.Vector3(), direction = new THREE.Vector3(), pole = new THREE.Vector3();
  const bend = new THREE.Vector3(), desiredElbow = new THREE.Vector3();
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const delta = new THREE.Quaternion(), parent = new THREE.Quaternion(), inverseParent = new THREE.Quaternion();
  function aim(bone, point, destination) {
    bone.getWorldPosition(from);
    to.copy(destination).sub(from).normalize();
    from.negate().add(point).normalize();
    delta.setFromUnitVectors(from, to);
    bone.parent.getWorldQuaternion(parent);
    inverseParent.copy(parent).invert();
    delta.premultiply(inverseParent).multiply(parent);
    bone.quaternion.premultiply(delta).normalize();
    grip.updateWorldMatrix(true, false);
  }
  return function solve(localTarget, weight) {
    if (weight < 0.001) return;
    grip.updateWorldMatrix(true, false);
    grip.getWorldPosition(end);
    target.copy(localTarget); root.localToWorld(target);
    target.lerpVectors(end, target, weight);
    // A second pass compensates for the dolls' slightly nonuniform scale.
    for (let pass = 0; pass < 2; pass++) {
      upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); grip.getWorldPosition(end);
      const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(end);
      const distance = Math.max(Math.abs(a - b) + 0.0001, Math.min(a + b - 0.0001, shoulder.distanceTo(target)));
      direction.copy(target).sub(shoulder).normalize();
      // Elbows bend down and out, rather than flipping across the chest.
      pole.set(side * 0.45, -0.7, 0.12).transformDirection(root.matrixWorld);
      bend.copy(pole).addScaledVector(direction, -pole.dot(direction)).normalize();
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
      aim(upper, elbow, desiredElbow);
      grip.getWorldPosition(end);
      aim(lower, end, target);
    }
  };
}
