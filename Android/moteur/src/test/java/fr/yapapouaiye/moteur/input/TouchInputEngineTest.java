package fr.yapapouaiye.moteur.input;

import org.junit.Test;

import java.util.Arrays;
import java.util.Random;

import static org.junit.Assert.*;

public class TouchInputEngineTest {
    private static final int W = 87;
    private static final int S = 83;
    private static final int A = 65;
    private static final int D = 68;
    private static final int SPACE = 32;
    private final InputStateTest.RecordingSink sink = new InputStateTest.RecordingSink();
    private final TouchInputEngine engine = new TouchInputEngine(sink, new MovementKeys(W, S, A, D));

    @Test public void buttonsAreMomentaryAndIndependentOfPointerIndexOrder() {
        engine.press(12, "jump", SPACE);
        engine.press(3, "inventory", 69);
        engine.releasePointer(12);
        assertFalse(engine.isPressed(SPACE));
        assertTrue(engine.isPressed(69));
        engine.releasePointer(3);
        assertEquals(Arrays.asList("32:true", "69:true", "32:false", "69:false"), sink.keys);
    }

    @Test public void twoFingersOnOneButtonCannotReleaseEachOthersKey() {
        engine.press(0, "jump", SPACE);
        engine.press(7, "jump", SPACE);
        engine.releasePointer(0);
        assertTrue(engine.isPressed(SPACE));
        engine.releasePointer(7);
        assertFalse(engine.isPressed(SPACE));
        assertEquals(Arrays.asList("32:true", "32:false"), sink.keys);
    }

    @Test public void movingOneFingerBetweenButtonsReleasesPreviousAction() {
        engine.press(1, "jump", SPACE);
        engine.press(1, "inventory", 69);
        assertFalse(engine.isPressed(SPACE));
        assertTrue(engine.isPressed(69));
        engine.releasePointer(1);
        assertFalse(engine.isPressed(69));
    }

    @Test public void repeatedPressDoesNotToggleOrRepeatEvents() {
        engine.press(0, "jump", SPACE);
        engine.press(0, "jump", SPACE);
        engine.press(0, "otherJump", SPACE);
        assertEquals(Arrays.asList("32:true"), sink.keys);
        engine.releasePointer(0);
        engine.releasePointer(0);
        assertEquals(Arrays.asList("32:true", "32:false"), sink.keys);
    }

    @Test public void joystickHasNeutralDeadZoneAndAxisHysteresis() {
        engine.joystick(4, 0.15f, -0.27f);
        assertTrue(sink.keys.isEmpty());
        engine.joystick(4, 0f, -0.29f);
        assertTrue(engine.isPressed(W));
        engine.joystick(4, 0f, -0.23f);
        assertTrue(engine.isPressed(W));
        engine.joystick(4, 0f, -0.18f);
        assertFalse(engine.isPressed(W));
        engine.joystick(4, 0f, -0.23f);
        assertFalse(engine.isPressed(W));
        assertEquals(Arrays.asList("87:true", "87:false"), sink.keys);
    }

    @Test public void joystickProducesDiagonalAndReleasesOnFingerUp() {
        engine.joystick(8, -0.9f, -0.9f);
        assertTrue(engine.isPressed(W));
        assertTrue(engine.isPressed(A));
        engine.releasePointer(8);
        assertFalse(engine.isPressed(W));
        assertFalse(engine.isPressed(A));
    }

    @Test public void reversingStickNeverLeavesOppositeMovementHeld() {
        engine.joystick(1, -1f, -1f);
        engine.joystick(1, 1f, 1f);
        assertFalse(engine.isPressed(W));
        assertFalse(engine.isPressed(A));
        assertTrue(engine.isPressed(S));
        assertTrue(engine.isPressed(D));
        assertEquals(Arrays.asList("87:true", "65:true", "87:false", "65:false", "83:true", "68:true"), sink.keys);
    }

    @Test public void anotherFingerCannotStealJoystick() {
        assertTrue(engine.joystick(8, 0f, -1f));
        assertFalse(engine.joystick(3, 0f, 1f));
        engine.releasePointer(3);
        assertTrue(engine.isPressed(W));
        assertFalse(engine.isPressed(S));
        engine.releasePointer(8);
        assertTrue(engine.joystick(3, 0f, 1f));
        assertTrue(engine.isPressed(S));
    }

    @Test public void buttonAndJoystickCanShareOneKeyWithoutPrematureRelease() {
        engine.joystick(4, 0f, -1f);
        engine.press(9, "forward", W);
        engine.releasePointer(4);
        assertTrue(engine.isPressed(W));
        engine.releasePointer(9);
        assertFalse(engine.isPressed(W));
        assertEquals(Arrays.asList("87:true", "87:false"), sink.keys);
    }

    @Test public void changingPointerRoleReleasesItsOldAction() {
        engine.press(4, "jump", SPACE);
        engine.joystick(4, 0f, -1f);
        assertFalse(engine.isPressed(SPACE));
        assertTrue(engine.isPressed(W));
        engine.beginLook(4, 20f, 30f);
        assertFalse(engine.isPressed(W));
        engine.moveLook(4, 25f, 30f);
        assertEquals(1, sink.looks.size());
    }

    @Test public void invalidJoystickInputNeutralizesHeldMovement() {
        engine.joystick(1, 0f, -1f);
        engine.joystick(1, Float.NaN, -1f);
        assertFalse(engine.isPressed(W));
        engine.joystick(1, 1f, 0f);
        engine.joystick(1, Float.POSITIVE_INFINITY, 0f);
        assertFalse(engine.isPressed(D));
    }

    @Test public void outOfRangeJoystickCoordinatesAreClamped() {
        engine.joystick(1, -200f, 500f);
        assertTrue(engine.isPressed(A));
        assertTrue(engine.isPressed(S));
        assertFalse(engine.isPressed(W));
        assertFalse(engine.isPressed(D));
    }

    @Test public void cameraUsesOnlyCapturedPointerAndRelativeDeltas() {
        assertTrue(engine.beginLook(7, 100f, 200f));
        assertFalse(engine.beginLook(1, 1f, 2f));
        engine.moveLook(1, 999f, 999f);
        engine.moveLook(7, 110f, 195f);
        engine.moveLook(7, 112f, 198f);
        assertEquals(2, sink.looks.size());
        assertArrayEquals(new float[] {10f, -5f}, sink.looks.get(0), 0f);
        assertArrayEquals(new float[] {2f, 3f}, sink.looks.get(1), 0f);
    }

    @Test public void releasingCameraAllowsFreshFingerWithoutJump() {
        engine.beginLook(7, 100f, 200f);
        engine.releasePointer(7);
        engine.moveLook(7, 500f, 500f);
        engine.beginLook(1, 900f, 800f);
        assertTrue(sink.looks.isEmpty());
        engine.moveLook(1, 903f, 804f);
        assertArrayEquals(new float[] {3f, 4f}, sink.looks.get(0), 0f);
    }

    @Test public void changingCameraSensitivityDoesNotChangeAnchor() {
        engine.beginLook(2, 100f, 100f);
        engine.setLookSensitivity(0.5f);
        engine.moveLook(2, 120f, 80f);
        assertArrayEquals(new float[] {10f, -10f}, sink.looks.get(0), 0f);
    }

    @Test public void invalidCameraCoordinatesReanchorWithoutEmittingInvalidDeltas() {
        engine.beginLook(1, 1f, 2f);
        engine.moveLook(1, Float.NaN, 2f);
        engine.moveLook(1, 100f, 100f);
        assertTrue(sink.looks.isEmpty());
        engine.moveLook(1, 105f, 106f);
        assertArrayEquals(new float[] {5f, 6f}, sink.looks.get(0), 0f);
    }

    @Test public void focusLossCancelsEveryRoleAndRecycledPointerIdsWorkAgain() {
        engine.joystick(4, -1f, -1f);
        engine.press(7, "jump", SPACE);
        engine.beginLook(11, 100f, 100f);
        engine.cancelAll();
        engine.cancelAll();
        engine.moveLook(11, 900f, 900f);
        engine.releasePointer(4);
        engine.releasePointer(7);
        assertFalse(engine.isPressed(W));
        assertFalse(engine.isPressed(A));
        assertFalse(engine.isPressed(SPACE));
        assertTrue(sink.looks.isEmpty());
        assertEquals(6, sink.keys.size());
        engine.press(4, "jump", SPACE);
        assertTrue(engine.isPressed(SPACE));
        engine.releasePointer(4);
        assertFalse(engine.isPressed(SPACE));
    }

    @Test public void randomMultitouchSessionsAlwaysEndWithBalancedKeyEvents() {
        Random random = new Random(14120);
        boolean[] down = new boolean[128];
        for (int session = 0; session < 200; session++) {
            for (int event = 0; event < 80; event++) {
                int pointer = random.nextInt(12);
                switch (random.nextInt(5)) {
                    case 0: engine.press(pointer, "jump", SPACE); break;
                    case 1: engine.joystick(pointer, random.nextFloat() * 2 - 1, random.nextFloat() * 2 - 1); break;
                    case 2: engine.beginLook(pointer, random.nextFloat() * 100, random.nextFloat() * 100); break;
                    case 3: engine.moveLook(pointer, random.nextFloat() * 100, random.nextFloat() * 100); break;
                    default: engine.releasePointer(pointer);
                }
            }
            engine.cancelAll();
            for (String event : sink.keys) {
                String[] parts = event.split(":");
                int key = Integer.parseInt(parts[0]);
                boolean pressed = Boolean.parseBoolean(parts[1]);
                assertNotEquals("Duplicate state event " + event, down[key], pressed);
                down[key] = pressed;
            }
            for (boolean pressed : down) assertFalse("A key stayed held after cancel", pressed);
            sink.keys.clear();
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void negativePointerIdsAreRejected() {
        engine.press(-1, "jump", SPACE);
    }

    @Test(expected = IllegalArgumentException.class)
    public void invalidSensitivityIsRejected() {
        engine.setLookSensitivity(Float.NaN);
    }

    @Test(expected = IllegalArgumentException.class)
    public void invalidHysteresisThresholdsAreRejected() {
        new TouchInputEngine(sink, new MovementKeys(W, S, A, D), 0.2f, 0.3f);
    }
}
