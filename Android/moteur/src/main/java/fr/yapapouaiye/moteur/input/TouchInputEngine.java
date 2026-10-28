package fr.yapapouaiye.moteur.input;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Framework-independent multitouch controller. Each pointer has one role:
 * momentary button, movement stick, or camera. Pointer IDs, never Android
 * pointer indices, identify fingers. There are no implicit toggle buttons.
 * Call releasePointer on UP/POINTER_UP and cancelAll on CANCEL, pause, focus
 * loss, detachment and control-layout replacement.
 */
public final class TouchInputEngine {
    public static final float DEFAULT_ENGAGE_THRESHOLD = 0.28f;
    public static final float DEFAULT_RELEASE_THRESHOLD = 0.18f;

    private final EventSink sink;
    private final InputState state;
    private final MovementKeys movementKeys;
    private final float engageThreshold;
    private final float releaseThreshold;
    private final Map<Integer, Button> buttons = new LinkedHashMap<>();
    private int joystickPointer = -1;
    private int lookPointer = -1;
    private int horizontal;
    private int vertical;
    private float lookX;
    private float lookY;
    private float lookSensitivity = 1f;

    public TouchInputEngine(EventSink sink, MovementKeys movementKeys) {
        this(sink, movementKeys, DEFAULT_ENGAGE_THRESHOLD, DEFAULT_RELEASE_THRESHOLD);
    }

    public TouchInputEngine(EventSink sink, MovementKeys movementKeys,
            float engageThreshold, float releaseThreshold) {
        if (sink == null) throw new NullPointerException("sink");
        if (movementKeys == null) throw new NullPointerException("movementKeys");
        if (!finite(engageThreshold) || !finite(releaseThreshold)
                || releaseThreshold < 0f || engageThreshold <= releaseThreshold
                || engageThreshold > 1f) {
            throw new IllegalArgumentException("Require 0 <= release < engage <= 1");
        }
        this.sink = sink;
        this.state = new InputState(sink);
        this.movementKeys = movementKeys;
        this.engageThreshold = engageThreshold;
        this.releaseThreshold = releaseThreshold;
    }

    /**
     * Presses a momentary button. Repeating the same press is idempotent.
     * Moving a captured finger to another control replaces its previous role.
     */
    public void press(int pointerId, String controlId, int keyCode) {
        requirePointer(pointerId);
        if (controlId == null || controlId.isEmpty()) {
            throw new IllegalArgumentException("controlId must not be empty");
        }
        Button current = buttons.get(pointerId);
        if (current != null && current.controlId.equals(controlId)
                && current.keyCode == keyCode) return;
        // Replacing one button that emits the same key must not pulse that key.
        if (current != null && current.keyCode == keyCode) {
            buttons.put(pointerId, new Button(controlId, keyCode));
            return;
        }
        releasePointer(pointerId);
        buttons.put(pointerId, new Button(controlId, keyCode));
        state.press(buttonOwner(pointerId), keyCode);
    }

    /**
     * Captures/updates the movement stick. Coordinates are normalized to [-1,1],
     * X grows rightwards and negative Y moves forward. Another finger cannot
     * steal an active stick. Returns false when that finger was ignored.
     */
    public boolean joystick(int pointerId, float x, float y) {
        requirePointer(pointerId);
        if (joystickPointer != -1 && joystickPointer != pointerId) return false;
        if (joystickPointer == -1) {
            releasePointer(pointerId);
            joystickPointer = pointerId;
        }
        // Invalid sensor/touch input neutralizes movement rather than leaving it held.
        if (!finite(x) || !finite(y)) {
            x = 0f;
            y = 0f;
        }
        horizontal = axis(horizontal, clamp(x));
        vertical = axis(vertical, clamp(y));
        int[] keys = new int[(horizontal == 0 ? 0 : 1) + (vertical == 0 ? 0 : 1)];
        int index = 0;
        if (vertical != 0) {
            keys[index++] = vertical < 0 ? movementKeys.forward : movementKeys.backward;
        }
        if (horizontal != 0) {
            keys[index] = horizontal < 0 ? movementKeys.left : movementKeys.right;
        }
        state.replace(joystickOwner(pointerId), keys);
        return true;
    }

    /** Captures one camera finger, anchoring it without producing an initial jump. */
    public boolean beginLook(int pointerId, float x, float y) {
        requirePointer(pointerId);
        if (!finite(x) || !finite(y)) return false;
        if (lookPointer != -1 && lookPointer != pointerId) return false;
        if (lookPointer != pointerId) releasePointer(pointerId);
        lookPointer = pointerId;
        lookX = x;
        lookY = y;
        return true;
    }

    /** Only the captured camera finger can move the camera. */
    public void moveLook(int pointerId, float x, float y) {
        requirePointer(pointerId);
        if (lookPointer != pointerId) return;
        if (!finite(x) || !finite(y)) {
            // The next valid position must anchor again, without jumping.
            lookX = Float.NaN;
            lookY = Float.NaN;
            return;
        }
        if (finite(lookX) && finite(lookY)) {
            float deltaX = (x - lookX) * lookSensitivity;
            float deltaY = (y - lookY) * lookSensitivity;
            if (finite(deltaX) && finite(deltaY) && (deltaX != 0f || deltaY != 0f)) {
                sink.look(deltaX, deltaY);
            }
        }
        lookX = x;
        lookY = y;
    }

    /** Releases all roles owned by one pointer, preserving other fingers. */
    public void releasePointer(int pointerId) {
        requirePointer(pointerId);
        if (buttons.remove(pointerId) != null) state.releaseOwner(buttonOwner(pointerId));
        if (joystickPointer == pointerId) {
            joystickPointer = -1;
            horizontal = 0;
            vertical = 0;
            state.releaseOwner(joystickOwner(pointerId));
        }
        if (lookPointer == pointerId) {
            lookPointer = -1;
            lookX = 0f;
            lookY = 0f;
        }
    }

    /**
     * Ends an input session. Safe to call repeatedly; no stale pointer can
     * reactivate a key or camera until a new capture/press is received.
     */
    public void cancelAll() {
        buttons.clear();
        joystickPointer = -1;
        lookPointer = -1;
        horizontal = 0;
        vertical = 0;
        lookX = 0f;
        lookY = 0f;
        state.releaseAll();
    }

    public void setLookSensitivity(float sensitivity) {
        if (!finite(sensitivity) || sensitivity <= 0f) {
            throw new IllegalArgumentException("Sensitivity must be finite and positive");
        }
        lookSensitivity = sensitivity;
    }

    public boolean isPressed(int keyCode) {
        return state.isPressed(keyCode);
    }

    private int axis(int previous, float value) {
        if (value >= engageThreshold) return 1;
        if (value <= -engageThreshold) return -1;
        if (previous == 1 && value > releaseThreshold) return 1;
        if (previous == -1 && value < -releaseThreshold) return -1;
        return 0;
    }

    private static float clamp(float value) {
        return Math.max(-1f, Math.min(1f, value));
    }

    private static boolean finite(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value);
    }

    private static void requirePointer(int pointerId) {
        if (pointerId < 0) throw new IllegalArgumentException("pointerId must be nonnegative");
    }

    private static String buttonOwner(int pointerId) {
        return "button:" + pointerId;
    }

    private static String joystickOwner(int pointerId) {
        return "joystick:" + pointerId;
    }

    private static final class Button {
        final String controlId;
        final int keyCode;

        Button(String controlId, int keyCode) {
            this.controlId = controlId;
            this.keyCode = keyCode;
        }
    }
}
