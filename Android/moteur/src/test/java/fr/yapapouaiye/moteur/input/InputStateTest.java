package fr.yapapouaiye.moteur.input;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.*;

public class InputStateTest {
    private final RecordingSink sink = new RecordingSink();
    private final InputState state = new InputState(sink);

    @Test public void sharedKeyStaysHeldUntilLastOwnerReleases() {
        state.press("finger:4", 32);
        state.press("finger:9", 32);
        state.releaseOwner("finger:4");
        assertTrue(state.isPressed(32));
        assertEquals(Arrays.asList("32:true"), sink.keys);
        state.releaseOwner("finger:9");
        assertFalse(state.isPressed(32));
        assertEquals(Arrays.asList("32:true", "32:false"), sink.keys);
    }

    @Test public void repeatedDownAndReleaseAreIdempotent() {
        state.press("jump", 32);
        state.press("jump", 32);
        state.release("missing", 32);
        state.release("jump", 99);
        state.release("jump", 32);
        state.release("jump", 32);
        assertEquals(Arrays.asList("32:true", "32:false"), sink.keys);
    }

    @Test public void releasingOneKeyPreservesOtherKeysForTheSameOwner() {
        state.press("keyboard", 87);
        state.press("keyboard", 32);
        state.release("keyboard", 87);
        assertFalse(state.isPressed(87));
        assertTrue(state.isPressed(32));
        state.releaseOwner("keyboard");
        assertTrue(state.pressedKeys().isEmpty());
    }

    @Test public void replacementDoesNotPulseUnchangedKeys() {
        state.replace("stick", 87, 65);
        state.replace("stick", 87, 68, 68);
        assertEquals(Arrays.asList("87:true", "65:true", "65:false", "68:true"), sink.keys);
        assertEquals(2, state.pressedKeys().size());
        state.replace("stick");
        assertTrue(state.pressedKeys().isEmpty());
    }

    @Test public void releaseAllEmitsOnlyOneReleasePerKeyAndAllowsNewSession() {
        state.press("finger1", 32);
        state.press("finger2", 32);
        state.press("stick", 87);
        state.releaseAll();
        state.releaseAll();
        state.releaseOwner("finger1");
        assertEquals(Arrays.asList("32:true", "87:true", "32:false", "87:false"), sink.keys);
        assertTrue(state.pressedKeys().isEmpty());
        state.press("finger1", 32);
        assertTrue(state.isPressed(32));
        assertEquals("32:true", sink.keys.get(4));
    }

    @Test public void snapshotsCannotChangeStateAndDoNotTrackLaterEvents() {
        state.press("a", 87);
        Set<Integer> snapshot = state.pressedKeys();
        state.press("b", 32);
        assertFalse(snapshot.contains(32));
        try {
            snapshot.clear();
            fail("Snapshot should be immutable");
        } catch (UnsupportedOperationException expected) {
            assertTrue(state.isPressed(87));
        }
    }

    @Test public void emptyOwnersAreRejectedBeforeAnyStateChange() {
        try {
            state.press("", 32);
            fail("Empty owner should be rejected");
        } catch (IllegalArgumentException expected) {
            assertTrue(state.pressedKeys().isEmpty());
        }
    }

    static final class RecordingSink implements EventSink {
        final List<String> keys = new ArrayList<>();
        final List<float[]> looks = new ArrayList<>();

        @Override public void key(int code, boolean down) {
            keys.add(code + ":" + down);
        }

        @Override public void look(float deltaX, float deltaY) {
            looks.add(new float[] { deltaX, deltaY });
        }
    }
}
