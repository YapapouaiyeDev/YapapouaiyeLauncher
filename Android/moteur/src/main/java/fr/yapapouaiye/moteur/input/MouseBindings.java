/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;

/** Normalize modern and legacy Minecraft mouse bindings before a keyboard mapper sees them. */
public final class MouseBindings {
    private MouseBindings() { }
    public static Integer code(String value) {
        if(value==null)return null;
        int button;
        if("key.mouse.left".equals(value))button=0;
        else if("key.mouse.right".equals(value))button=1;
        else if("key.mouse.middle".equals(value))button=2;
        else if(value.matches("key\\.mouse\\.[4-8]"))button=Integer.parseInt(value.substring(10))-1;
        else {
            try { int legacy=Integer.parseInt(value);if(legacy < -100 || legacy > -93)return null;button=legacy+100; }
            catch(NumberFormatException ignore){return null;}
        }
        if(button==0)return 1000;
        if(button==1)return 1002;
        if(button==2)return 1001;
        return 2000+button;
    }
}
