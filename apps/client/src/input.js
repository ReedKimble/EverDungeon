export class InputState {
  constructor(targetElement) {
    this.targetElement = targetElement;
    this.keysDown = new Set();
    this.actions = new Set();
    this.mouseDeltaX = 0;
    this.mouseWheelDelta = 0;
    this.pointerLocked = false;

    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("mousedown", (event) => this.onMouseDown(event));
    window.addEventListener("wheel", (event) => this.onMouseWheel(event), { passive: false });
    window.addEventListener("contextmenu", (event) => this.onContextMenu(event));
    document.addEventListener("pointerlockchange", () => this.onPointerLockChange());
  }

  onKeyDown(event) {
    if (event.code === "Tab") {
      event.preventDefault();
    }

    if (!this.keysDown.has(event.code)) {
      this.actions.add(event.code);
    }

    this.keysDown.add(event.code);
  }

  onKeyUp(event) {
    this.keysDown.delete(event.code);
  }

  onMouseMove(event) {
    if (!this.pointerLocked) {
      return;
    }

    this.mouseDeltaX += event.movementX;
  }

  onMouseDown(event) {
    if (event.button === 2) {
      event.preventDefault();
    }

    if (!this.pointerLocked) {
      return;
    }

    if (event.button === 0) {
      this.actions.add("MouseLeft");
    } else if (event.button === 2) {
      this.actions.add("MouseRight");
    }
  }

  onMouseWheel(event) {
    if (!this.pointerLocked) {
      return;
    }

    event.preventDefault();
    this.mouseWheelDelta += event.deltaY;
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.targetElement;
  }

  requestPointerLock() {
    this.targetElement.requestPointerLock();
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  consumeAction(code) {
    if (!this.actions.has(code)) {
      return false;
    }

    this.actions.delete(code);
    return true;
  }

  consumeMouseDeltaX() {
    const delta = this.mouseDeltaX;
    this.mouseDeltaX = 0;
    return delta;
  }

  consumeMouseWheelDirection() {
    if (Math.abs(this.mouseWheelDelta) < 20) {
      return 0;
    }

    const direction = Math.sign(this.mouseWheelDelta);
    this.mouseWheelDelta = 0;
    return direction;
  }
}
