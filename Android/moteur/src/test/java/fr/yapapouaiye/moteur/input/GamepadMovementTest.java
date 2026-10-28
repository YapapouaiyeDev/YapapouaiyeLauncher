package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;

public class GamepadMovementTest {
    @Test public void heldStickAndAdjacentDirectionsKeepForwardPressed() {
        GamepadMovement movement=new GamepadMovement();
        for(int i=0;i<1000;i++)assertEquals(2,movement.update((i%5-2)*.02f,-1,.15f));
        assertEquals(3,movement.update(1,-1,.15f));
        assertEquals(2,movement.update(0,-1,.15f));
        assertEquals(0,movement.update(0,0,.15f));
    }
    @Test public void deadzoneNoiseDoesNotChatterAndCenterStillReleases() {
        GamepadMovement movement=new GamepadMovement();
        assertEquals(0,movement.update(0,-.14f,.15f));
        assertEquals(2,movement.update(0,-.16f,.15f));
        for(int i=0;i<100;i++)assertEquals(2,movement.update(0,-.14f,.15f));
        assertEquals(0,movement.update(0,-.1f,.15f));
        assertEquals(0,movement.update(0,-.14f,.15f));
    }
    @Test public void angularNoiseDoesNotChatterAndAllDirectionsRemainAvailable() {
        GamepadMovement movement=new GamepadMovement();
        assertEquals(1,movement.update(1,0,.15f));
        for(int i=0;i<100;i++)assertEquals(1,movement.update(1,-.43f,.15f));
        assertEquals(3,movement.update(1,-1,.15f));
        int[] masks={1,3,2,6,4,12,8,9};
        for(int i=0;i<8;i++)assertEquals(masks[i],movement.update((float)Math.cos(i*Math.PI/4),(float)-Math.sin(i*Math.PI/4),.15f));
    }
    @Test public void resetAndInvalidSamplesReleaseWithoutPoisoningNextInput() {
        GamepadMovement movement=new GamepadMovement();
        assertEquals(2,movement.update(0,-1,.15f));movement.reset();
        assertEquals(0,movement.update(0,-.14f,.15f));
        assertEquals(0,movement.update(Float.NaN,-1,.15f));
        assertEquals(0,movement.update(1,Float.POSITIVE_INFINITY,.15f));
        assertEquals(2,movement.update(0,-1,Float.NaN));
    }
}
