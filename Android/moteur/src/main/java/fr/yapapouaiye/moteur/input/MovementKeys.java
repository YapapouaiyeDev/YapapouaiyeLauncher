package fr.yapapouaiye.moteur.input;

/** Key codes belong to the receiving runtime; the input engine has no GLFW dependency. */
public final class MovementKeys {
    public final int forward;
    public final int backward;
    public final int left;
    public final int right;

    public MovementKeys(int forward, int backward, int left, int right) {
        if (forward == backward || forward == left || forward == right
                || backward == left || backward == right || left == right) {
            throw new IllegalArgumentException("Movement keys must be distinct");
        }
        this.forward = forward;
        this.backward = backward;
        this.left = left;
        this.right = right;
    }
}
