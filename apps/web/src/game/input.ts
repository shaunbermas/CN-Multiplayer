// Keyboard + pointer-lock mouse look. Camera yaw 0 faces -Z (the course).
export const input = { forward: 0, right: 0, yaw: 0, pitch: -0.12, respawn: false, skip: false, cycle: false };

const held = new Set<string>();
function update() {
  input.forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
  input.right = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
}

export function attachInput(canvas: HTMLElement): () => void {
  const down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    held.add(e.code);
    if (e.code === 'KeyR') input.respawn = true;
    if (e.code === 'Space' || e.code === 'Enter') input.skip = true;
    if (e.code === 'Tab' || e.code === 'KeyT') { input.cycle = true; e.preventDefault(); }
    update();
  };
  const up = (e: KeyboardEvent) => { held.delete(e.code); update(); };
  const blur = () => { held.clear(); update(); }; // never keep walking after the tab loses focus
  const click = () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); };
  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    input.yaw -= e.movementX * 0.0025;
    input.pitch = Math.max(-0.6, Math.min(0.35, input.pitch - e.movementY * 0.002));
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  canvas.addEventListener('click', click);
  window.addEventListener('mousemove', move);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    canvas.removeEventListener('click', click);
    window.removeEventListener('mousemove', move);
  };
}
