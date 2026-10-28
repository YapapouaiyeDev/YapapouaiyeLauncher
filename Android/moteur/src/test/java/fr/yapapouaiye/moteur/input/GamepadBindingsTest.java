package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class GamepadBindingsTest {
    @Test public void everyButtonHasValidDefaultAndDistinctIdentity() {
        assertEquals(16,GamepadBindings.BUTTONS.length);assertEquals(16,new HashSet<>(Arrays.asList(GamepadBindings.BUTTONS)).size());
        assertEquals(GamepadBindings.ACTIONS.length,GamepadBindings.TITLES.length);
        for(int i=0;i<16;i++){assertTrue(GamepadBindings.actionIndex(GamepadBindings.defaultAction(i))>=0);assertTrue(GamepadBindings.fallbackCode(GamepadBindings.defaultAction(i))>0);}
    }
    @Test public void triggersUseMinecraftMouseOrderingAndFaceButtonsAreMomentaryActions() {
        assertEquals("use",GamepadBindings.defaultAction(6));assertEquals(1002,GamepadBindings.fallbackCode("use"));
        assertEquals("attack",GamepadBindings.defaultAction(7));assertEquals(1000,GamepadBindings.fallbackCode("attack"));
        assertEquals(0,GamepadBindings.buttonIndex(96));assertEquals(6,GamepadBindings.buttonIndex(104));assertEquals(-1,GamepadBindings.buttonIndex(24));
    }
    @Test public void invalidSavedActionsCannotCreateUnknownOrStuckKeys() {
        assertEquals("jump",GamepadBindings.validAction("corrupt",0));assertEquals("sneak",GamepadBindings.validAction(null,1));
        assertEquals(-1,GamepadBindings.fallbackCode("none"));assertEquals(-1,GamepadBindings.fallbackCode("corrupt"));
        for(int i=1;i<=9;i++){assertEquals(i+1,GamepadBindings.fallbackCode("slot"+i));assertEquals("key_key.hotbar."+i,GamepadBindings.binding("slot"+i));}
    }
}
