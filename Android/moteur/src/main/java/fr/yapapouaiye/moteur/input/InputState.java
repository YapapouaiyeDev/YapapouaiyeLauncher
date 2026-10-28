package fr.yapapouaiye.moteur.input;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Aggregates momentary key ownership across fingers and other input sources.
 * A key is released only when its last owner releases it. Calls and callbacks
 * are synchronous; use one input thread, normally the Android UI thread.
 */
public final class InputState {
    private final EventSink sink;
    private final Map<String, Set<Integer>> byOwner = new LinkedHashMap<>();
    private final Map<Integer, Set<String>> byKey = new LinkedHashMap<>();

    public InputState(EventSink sink) {
        if (sink == null) throw new NullPointerException("sink");
        this.sink = sink;
    }

    public void press(String owner, int code) {
        requireOwner(owner);
        Set<Integer> keys = byOwner.get(owner);
        if (keys == null) {
            keys = new LinkedHashSet<>();
            byOwner.put(owner, keys);
        }
        if (!keys.add(code)) return;
        Set<String> owners = byKey.get(code);
        if (owners == null) {
            owners = new LinkedHashSet<>();
            byKey.put(code, owners);
        }
        boolean wasReleased = owners.isEmpty();
        owners.add(owner);
        if (wasReleased) sink.key(code, true);
    }

    public void release(String owner, int code) {
        requireOwner(owner);
        Set<Integer> keys = byOwner.get(owner);
        if (keys == null || !keys.remove(code)) return;
        if (keys.isEmpty()) byOwner.remove(owner);
        Set<String> owners = byKey.get(code);
        owners.remove(owner);
        if (owners.isEmpty()) {
            byKey.remove(code);
            sink.key(code, false);
        }
    }

    /** Replaces an owner's keys without releasing keys that remain held by that owner. */
    public void replace(String owner, int... codes) {
        requireOwner(owner);
        if (codes == null) throw new NullPointerException("codes");
        Set<Integer> wanted = new LinkedHashSet<>();
        for (int code : codes) wanted.add(code);
        Set<Integer> existing = byOwner.get(owner);
        if (existing != null) {
            for (int code : new ArrayList<>(existing)) {
                if (!wanted.contains(code)) release(owner, code);
            }
        }
        for (int code : wanted) press(owner, code);
    }

    public void releaseOwner(String owner) {
        requireOwner(owner);
        Set<Integer> keys = byOwner.get(owner);
        if (keys == null) return;
        for (int code : new ArrayList<>(keys)) release(owner, code);
    }

    /** Releases every held key exactly once, regardless of how many owners held it. */
    public void releaseAll() {
        ArrayList<Integer> keys = new ArrayList<>(byKey.keySet());
        byOwner.clear();
        byKey.clear();
        for (int code : keys) sink.key(code, false);
    }

    public boolean isPressed(int code) {
        return byKey.containsKey(code);
    }

    /** A read-only snapshot, unaffected by subsequent input events. */
    public Set<Integer> pressedKeys() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(byKey.keySet()));
    }

    private static void requireOwner(String owner) {
        if (owner == null || owner.isEmpty()) {
            throw new IllegalArgumentException("An input owner must have a nonempty name");
        }
    }
}
