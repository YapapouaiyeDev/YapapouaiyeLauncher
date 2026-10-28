package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class KeyboardKeysTest {
    @Test public void everyKeySurvivesSavedProfilesAndBypassesMinecraftActionRemapping() {
        Set<Integer> codes=new HashSet<>(),android=new HashSet<>();assertTrue(KeyboardKeys.ALL.size()>90);
        for(KeyboardKeys.Key key:KeyboardKeys.ALL) {
            assertTrue(codes.add(key.code));assertTrue(android.add(key.android));
            assertSame(key,KeyboardKeys.fromAction(key.action()));assertSame(key,KeyboardKeys.fromAndroid(key.android));
            assertEquals(key.action(),GamepadBindings.validAction(key.action(),0));
            assertEquals(key.code,GamepadBindings.fallbackCode(key.action()));assertNull(GamepadBindings.binding(key.action()));
            assertEquals("Clavier : "+key.title,GamepadBindings.title(key.action()));
        }
    }
    @Test public void namesAreCaseAndAccentInsensitiveAndDoNotGuessOtherKeys() {
        assertEquals(34,KeyboardKeys.parse(" g ").code);assertEquals(64,KeyboardKeys.parse("f6").code);
        assertEquals(88,KeyboardKeys.parse("F12").code);assertEquals(1,KeyboardKeys.parse("echap").code);
        assertEquals(97,KeyboardKeys.parse("ctrl droit").code);assertEquals(105,KeyboardKeys.parse("left").code);
        assertEquals(54,KeyboardKeys.parse("right shift").code);assertEquals(28,KeyboardKeys.parse("enter").code);
        assertEquals(34,KeyboardKeys.parse("key.keyboard.g").code);assertNull(KeyboardKeys.parse("une commande inconnue"));
    }
    @Test public void malformedStoredKeysCannotInjectMouseEventsOrUnknownCodes() {
        for(String value:new String[]{null,"key:","key:-1","key:0","key:240","key:1000","key:2003","key:034","key:99999999999999999999","key:34\n"}) {
            assertNull(KeyboardKeys.fromAction(value));assertEquals("jump",GamepadBindings.validAction(value,0));
        }
        assertNull(KeyboardKeys.fromAndroid(24));assertNull(KeyboardKeys.fromAndroid(96));
    }
    @Test public void customModifierHeldByTwoButtonsReleasesOnlyWithLastOwner() {
        List<String> events=new ArrayList<>();InputState state=new InputState(new EventSink(){public void key(int code,boolean down){events.add(code+":"+down);}public void look(float x,float y){}});
        int code=GamepadBindings.fallbackCode(KeyboardKeys.parse("Ctrl droit").action());
        state.press("a",code);state.press("b",code);state.releaseOwner("a");assertEquals(List.of("97:true"),events);
        state.releaseAll();assertEquals(List.of("97:true","97:false"),events);
    }
}
