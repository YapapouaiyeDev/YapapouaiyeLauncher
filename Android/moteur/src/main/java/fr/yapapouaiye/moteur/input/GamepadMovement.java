/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;

/** Stable eight-way keyboard movement, retaining keys shared by adjacent directions. */
public final class GamepadMovement {
    public static final int RIGHT=1, FORWARD=2, LEFT=4, BACK=8;
    private static final int[] MASKS={RIGHT,RIGHT|FORWARD,FORWARD,FORWARD|LEFT,
            LEFT,LEFT|BACK,BACK,BACK|RIGHT};
    private int direction=-1;

    public int update(float x,float y,float deadzone) {
        if(!Float.isFinite(x)||!Float.isFinite(y)) { reset();return 0; }
        float threshold=Float.isFinite(deadzone)?Math.max(.01f,Math.min(.95f,deadzone)):.15f;
        // A little hysteresis prevents noisy samples from repeatedly releasing a held stick.
        if(Math.hypot(x,y)<threshold*(direction<0?1f:.8f)) { reset();return 0; }
        double angle=(Math.toDegrees(-Math.atan2(y,x))+360)%360;
        if(direction>=0) {
            double distance=Math.abs(((angle-direction*45+540)%360)-180);
            if(distance<=27.5)return MASKS[direction];
        }
        direction=((int)((angle+22.5)/45))%8;
        return MASKS[direction];
    }
    public void reset() { direction=-1; }
}
