package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class TouchButtonTest {
    @Test public void fixedButtonsRemainVisibleWithControllerAndTouchOnlyButtonsFollowMode() {
        TouchButton fixed=TouchButton.nexlux(),touch=new TouchButton("custom-g","G",34,false);
        assertTrue(fixed.visible(false,false));assertTrue(fixed.visible(true,false));
        assertFalse(touch.visible(false,false));assertTrue(touch.visible(true,false));assertTrue(touch.visible(false,true));
    }
    @Test public void keyboardTokensCannotCollideWithGameActionsMouseOrUnknownKeys() {
        for(KeyboardKeys.Key key:KeyboardKeys.ALL){TouchButton button=new TouchButton("custom-test",key.title.length()>20?"Test":key.title,key.code,false);assertTrue(button.token()>10000);assertEquals(key.code,TouchButton.rawKey(button.token()));}
        for(int invalid:new int[]{57,1000,2003,10000,10240,Integer.MAX_VALUE,Integer.MIN_VALUE})assertEquals(-1,TouchButton.rawKey(invalid));
        assertEquals(54,TouchButton.nexlux().key);
    }
    @Test public void malformedButtonsCannotBeCreated() {
        for(String id:new String[]{null,"jump","custom-","custom-../file"})expectInvalid(id,"Test",34);
        for(String label:new String[]{null," ","A\nB","012345678901234567890"})expectInvalid("custom-test",label,34);
        expectInvalid("custom-test","Test",1000);expectInvalid("custom-test","Test",240);
    }
    @Test public void customButtonsReleaseOnCancelAndKeepOtherFingerOwner() {
        List<String> events=new ArrayList<>();TouchInputEngine engine=new TouchInputEngine(new EventSink(){public void key(int code,boolean down){events.add(code+":"+down);}public void look(float x,float y){}},new MovementKeys(17,31,30,32));
        int code=TouchButton.nexlux().token();engine.press(1,"custom-nexlux",code);engine.press(2,"custom-other",code);engine.releasePointer(1);assertEquals(List.of("10054:true"),events);engine.cancelAll();assertEquals(List.of("10054:true","10054:false"),events);
    }
    private void expectInvalid(String id,String label,int key){try{new TouchButton(id,label,key,true);fail("Invalid button accepted");}catch(IllegalArgumentException expected){}}
}
