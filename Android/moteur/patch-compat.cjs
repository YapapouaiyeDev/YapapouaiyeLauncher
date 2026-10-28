// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

/** Applied to the pinned upstream source, never to an already patched file. */
function patchFclInput(text, replaceOnce) {
  const leftStart=text.indexOf('    public void handleLeftJoyStick(');
  const leftEnd=text.indexOf('    public void handleRightJoyStick(',leftStart);
  if(leftStart<0||leftEnd<leftStart)throw new Error('Joystick movement anchors missing');
  text=text.slice(0,leftStart)+`    private final fr.yapapouaiye.moteur.input.GamepadMovement gamepadMovement = new fr.yapapouaiye.moteur.input.GamepadMovement();

    public void handleLeftJoyStick(float xAxis, float yAxis) {
        int keys = gamepadMovement.update(xAxis, yAxis, (float) menu.getMenuSetting().getGamepadDeadzone());
        // update() sends only transitions. Never release a key retained by the next direction.
        gamepad.getCurrentMap().DIRECTION_RIGHT.update((keys & 1) != 0);
        gamepad.getCurrentMap().DIRECTION_FORWARD.update((keys & 2) != 0);
        gamepad.getCurrentMap().DIRECTION_LEFT.update((keys & 4) != 0);
        gamepad.getCurrentMap().DIRECTION_BACKWARD.update((keys & 8) != 0);
    }

`+text.slice(leftEnd);
  text=replaceOnce(text, `            doTick();\n        }\n    }\n\n    private void doTick() {`,
    `        }\n    }\n\n    private void doTick(long frameTimeNanos) {`);
  text=replaceOnce(text, `        long newFrameTime = System.nanoTime();\n        if (lastAxisZ != 0 || lastAxisRZ != 0) {\n            newFrameTime = System.nanoTime();`,
    `        long newFrameTime = frameTimeNanos;\n        if (lastAxisZ != 0 || lastAxisRZ != 0) {`);
  for (const [axis, delta] of [['lastAxisZ', 'deltaX'], ['lastAxisRZ', 'deltaY']]) {
    text = replaceOnce(text, `${delta} = ${axis} * deltaTimeScale * 10 * menu.getMenuSetting().getMouseSensitivity();`,
      `${delta} = com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.cameraDelta(this, ${axis}, deltaTimeScale);`);
  }
  text = replaceOnce(text, '    private Choreographer choreographer;', `    private Choreographer choreographer;
    private Choreographer.FrameCallback gamepadFrameCallback;
    private boolean gamepadTickRunning;
    private boolean gamepadInputPaused;
    private int gamepadDeviceId = -1;`);

  text = replaceOnce(text, '    public void resetExternalMouseState() {', `    public void resetExternalMouseState() {
        resetGamepadState();`);
  text = replaceOnce(text, '    public void stopCaptureWatchdog() {', `    public void stopCaptureWatchdog() {
        gamepadInputPaused = true;
        resetGamepadState();`);
  text = replaceOnce(text, '    public void startCaptureWatchdog() {', `    public void startCaptureWatchdog() {
        gamepadInputPaused = false;`);

  const oldFrameLoop = `            if (choreographer == null) {
                choreographer = Choreographer.getInstance();
                Choreographer.FrameCallback frameCallback = new Choreographer.FrameCallback() {
                    @Override
                    public void doFrame(long frameTimeNanos) {
                        doTick();
                        choreographer.postFrameCallback(this);
                    }
                };
                choreographer.postFrameCallback(frameCallback);
            }
            return gamepad.handleMotionEventInput(event);`;
  text = replaceOnce(text, oldFrameLoop, `            if (!startGamepadTick(event.getDeviceId())) {
                return true;
            }
            return gamepad.handleMotionEventInput(event);`);
  text = replaceOnce(text, '            return gamepad.handleKeyEvent(event);', `            if (!startGamepadTick(event.getDeviceId())) {
                return true;
            }
            return gamepad.handleKeyEvent(event);`);

  // checkGamepad() above the SDL branch remains upstream-owned. A reset on a
  // device change can clear it, so startGamepadTick creates it again on success.
  text = replaceOnce(text, '    public void resetMapper() {', `    /** Stop Java-side input producers before resetting the native bridge. */
    public void resetGamepadState() {
        com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.reset(this);
        gamepadTickRunning = false;
        if (choreographer != null && gamepadFrameCallback != null) {
            choreographer.removeFrameCallback(gamepadFrameCallback);
        }
        gamepadFrameCallback = null;
        gamepadDeviceId = -1;
        lastAxisZ = 0;
        lastAxisRZ = 0;
        currentDirection = -1;
        gamepadMovement.reset();
        lastFrameTime = 0;
        if (gamepad != null) {
            // getButtons includes the four movement directions; upstream's
            // resetPressedState omits them. Release toggled buttons as well.
            for (com.tungsten.fcl.control.gamepad.GamepadEmulatedButton button
                    : gamepad.getCurrentMap().getButtons()) {
                button.resetButtonState();
            }
            // The mapper also caches axes privately. Recreate it on fresh input
            // so an old component cannot be combined with a new axis sample.
            gamepad = null;
        }
    }

    private boolean canTickGamepad(int deviceId) {
        View view = focusableView;
        return !gamepadInputPaused && deviceId >= 0 && InputDevice.getDevice(deviceId) != null
                && view != null && view.isAttachedToWindow() && view.hasWindowFocus()
                && !menu.getActivity().isDestroyed() && !menu.getActivity().isFinishing()
                && menu.isGamepadControl()
                && SdlSettings.getGamepadInputMode().getValue() != GamepadInputMode.SDL_DIRECT;
    }

    private boolean startGamepadTick(int deviceId) {
        if (!canTickGamepad(deviceId)) {
            resetGamepadState();
            return false;
        }
        if (gamepadTickRunning && gamepadDeviceId == deviceId) {
            return true;
        }
        resetGamepadState();
        checkGamepad();
        gamepadDeviceId = deviceId;
        lastFrameTime = System.nanoTime();
        if (choreographer == null) {
            choreographer = Choreographer.getInstance();
        }
        gamepadTickRunning = true;
        gamepadFrameCallback = new Choreographer.FrameCallback() {
            @Override
            public void doFrame(long frameTimeNanos) {
                // Ignore a callback queued before reset/restart. Its instance
                // must never drive or reschedule a newer gamepad session.
                if (!gamepadTickRunning || gamepadFrameCallback != this) {
                    return;
                }
                if (!canTickGamepad(gamepadDeviceId)) {
                    resetGamepadState();
                    return;
                }
                doTick(frameTimeNanos);
                if (gamepadTickRunning && gamepadFrameCallback == this) {
                    choreographer.postFrameCallback(this);
                }
            }
        };
        choreographer.postFrameCallback(gamepadFrameCallback);
        return true;
    }

    public void resetMapper() {`);
  return text;
}

function patchGamepad(text, replaceOnce) {
  text=replaceOnce(text,'    private var axisRZ = 0.0f','    private var axisRZ = 0.0f\n    private var readingMotion = false');
  text=replaceOnce(text,'        return manager.handleMotionEventInput(context, event, this)',`        // The remapper dispatches axes separately. Commit one complete sample so
        // changing X cannot temporarily combine with the previous packet's Y.
        readingMotion = true
        try {
            return manager.handleMotionEventInput(context, event, this)
        } finally {
            readingMotion = false
            fclInput.handleLeftJoyStick(xAxis, yAxis)
            fclInput.handleRightJoyStick(axisZ, axisRZ)
        }`);
  for(const call of ['fclInput.handleLeftJoyStick(xAxis, yAxis)','fclInput.handleRightJoyStick(axisZ, axisRZ)']) {
    // The two callback sites, not the packet commit above.
    if(text.split(`                ${call}`).length!==3)throw new Error('Joystick callback anchors missing');
    text=text.replaceAll(`                ${call}`,`                if (!readingMotion) ${call}`);
  }
  return text;
}
module.exports = { patchFclInput, patchGamepad };
