package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;

public class GamepadLookTest {
    @Test public void fullStickCanTurnThreeToTwentyTimesFaster() {
        assertEquals(10f,GamepadLook.delta(1,1,100),.001f);
        assertEquals(30f,GamepadLook.delta(1,1,GamepadLook.DEFAULT),.001f);
        assertEquals(200f,GamepadLook.delta(1,1,2000),.001f);
        assertEquals(-200f,GamepadLook.delta(-1,1,2000),.001f);
        assertEquals(15f,GamepadLook.delta(.5f,1,300),.001f);
    }
    @Test public void refreshRateDoesNotChangeRotationSpeed() {
        float at60=0,at120=0,at30=0;
        for(int i=0;i<60;i++)at60+=GamepadLook.delta(1,1,500);
        for(int i=0;i<120;i++)at120+=GamepadLook.delta(1,.5f,500);
        for(int i=0;i<30;i++)at30+=GamepadLook.delta(1,2,500);
        assertEquals(at60,at120,.001f);assertEquals(at60,at30,.001f);
    }
    @Test public void centeredStickAndInvalidSamplesCannotMoveCamera() {
        assertEquals(0f,GamepadLook.delta(0,1,2000),0);
        assertEquals(0f,GamepadLook.delta(Float.NaN,1,300),0);
        assertEquals(0f,GamepadLook.delta(1,Float.POSITIVE_INFINITY,300),0);
        assertEquals(0f,GamepadLook.delta(1,-1,300),0);
    }
    @Test public void corruptSettingsAndDelayedFramesAreBounded() {
        assertEquals(25,GamepadLook.bounded(Integer.MIN_VALUE));
        assertEquals(2000,GamepadLook.bounded(Integer.MAX_VALUE));
        assertEquals(GamepadLook.delta(1,6,2000),GamepadLook.delta(9,1000,9000),0);
    }
}
