import * as CANNON from 'cannon-es';

export const FIXED_STEP = 1 / 120;
export const MAX_SPEED = 9;

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 20;
  world.solver.tolerance = 0.0001;

  const cm = world.defaultContactMaterial;
  cm.friction = 0.7;
  cm.restitution = 0.02;
  cm.contactEquationStiffness = 1e8;
  cm.contactEquationRelaxation = 3;
  cm.frictionEquationStiffness = 1e8;
  cm.frictionEquationRelaxation = 3;

  // Clamp speeds so thin ingredients don't tunnel through each other.
  world.addEventListener('postStep', () => {
    for (const body of world.bodies) {
      if (body.type !== CANNON.Body.DYNAMIC || body.thrown) continue;
      const v = body.velocity;
      const speed = v.length();
      if (speed > MAX_SPEED) v.scale(MAX_SPEED / speed, v);
    }
  });

  return world;
}

export function addStaticBox(world, halfExtents, position) {
  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(...halfExtents)),
    position: new CANNON.Vec3(...position),
  });
  world.addBody(body);
  return body;
}
