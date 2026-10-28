package fr.yapapouaiye.moteur.input;

/** Receives changes in logical key state and relative camera movement. */
public interface EventSink {
    /** Called only when the aggregate state changes; repeated owners do not repeat key-down. */
    void key(int code, boolean down);

    /** Relative camera displacement in pixels, after sensitivity has been applied. */
    void look(float deltaX, float deltaY);
}
