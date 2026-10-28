/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;
import java.text.Normalizer;
import java.util.*;

/** Keyboard keys shared by the picker, saved profiles and the runtime adapter. */
public final class KeyboardKeys {
    public static final class Key {
        public final String title;
        public final int code, android;
        private final String aliases;
        private Key(String title,int code,int android,String aliases) { this.title=title;this.code=code;this.android=android;this.aliases=aliases; }
        public String action() { return "key:"+code; }
        public boolean matches(String query) { String text=normalize(query);return normalize(title+" "+aliases).contains(text); }
    }
    public static final List<Key> ALL;
    static {
        List<Key> keys=new ArrayList<>();
        int[] letters={30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44};
        for(int i=0;i<26;i++)add(keys,String.valueOf((char)('A'+i)),letters[i],29+i,"");
        for(int i=0;i<10;i++)add(keys,String.valueOf(i),i==0?11:i+1,7+i,"");
        for(int i=1;i<=12;i++)add(keys,"F"+i,i<=10?58+i:76+i,130+i,"");
        add(keys,"Espace",57,62,"space");add(keys,"Entrée",28,66,"enter|return");add(keys,"Échap",1,111,"escape|esc");
        add(keys,"Tabulation",15,61,"tab");add(keys,"Retour arrière",14,67,"backspace");add(keys,"Supprimer",111,112,"delete|del");
        add(keys,"Maj gauche",42,59,"left shift|shift gauche");add(keys,"Maj droite",54,60,"right shift|shift droit");
        add(keys,"Ctrl gauche",29,113,"left control|control gauche");add(keys,"Ctrl droit",97,114,"right control|control droit");
        add(keys,"Alt gauche",56,57,"left alt");add(keys,"Alt droit / AltGr",100,58,"right alt|altgr");
        add(keys,"Super gauche",125,117,"left super|meta gauche|windows gauche");add(keys,"Super droit",126,118,"right super|meta droit|windows droit");
        add(keys,"Flèche haut",103,19,"up|haut");add(keys,"Flèche bas",108,20,"down|bas");
        add(keys,"Flèche gauche",105,21,"left|gauche");add(keys,"Flèche droite",106,22,"right|droite");
        add(keys,"Début",102,122,"home");add(keys,"Fin",107,123,"end");add(keys,"Insertion",110,124,"insert|ins");
        add(keys,"Page précédente",104,92,"pageup|page up");add(keys,"Page suivante",109,93,"pagedown|page down");
        add(keys,"Verr. majuscules",58,115,"capslock|caps lock");add(keys,"Verr. numérique",69,143,"numlock|num lock");
        add(keys,"Arrêt défilement",70,116,"scrolllock|scroll lock");add(keys,"Impr. écran",99,120,"printscreen|print screen|sysrq");add(keys,"Pause",119,121,"break");
        add(keys,",",51,55,"comma|virgule");add(keys,".",52,56,"period|point");add(keys,"/",53,76,"slash|barre oblique");
        add(keys,";",39,74,"semicolon|point virgule");add(keys,"'",40,75,"apostrophe");add(keys,"`",41,68,"grave|accent grave");
        add(keys,"-",12,69,"minus|moins");add(keys,"=",13,70,"equal|egal");add(keys,"[",26,71,"left bracket|crochet gauche");
        add(keys,"]",27,72,"right bracket|crochet droit");add(keys,"\\",43,73,"backslash|antislash");
        int[] numpad={82,79,80,81,75,76,77,71,72,73};
        for(int i=0;i<10;i++)add(keys,"Pavé numérique "+i,numpad[i],144+i,"keypad."+i+"|numpad "+i);
        add(keys,"Pavé numérique .",83,158,"keypad.decimal|numpad decimal");add(keys,"Pavé numérique +",78,157,"keypad.add|numpad add");
        add(keys,"Pavé numérique -",74,156,"keypad.subtract|numpad subtract");add(keys,"Pavé numérique *",55,155,"keypad.multiply|numpad multiply");
        add(keys,"Pavé numérique /",98,154,"keypad.divide|numpad divide");add(keys,"Pavé numérique Entrée",96,160,"keypad.enter|numpad enter");
        add(keys,"Pavé numérique =",117,161,"keypad.equal|numpad equal");
        ALL=Collections.unmodifiableList(keys);
    }
    private KeyboardKeys() { }
    private static void add(List<Key> keys,String title,int code,int android,String aliases) {keys.add(new Key(title,code,android,aliases));}
    private static String normalize(String value) { return Normalizer.normalize(value==null?"":value.trim().toLowerCase(Locale.ROOT),Normalizer.Form.NFD).replaceAll("\\p{M}","").replaceAll("\\s+"," "); }
    public static Key fromAction(String action) {
        if(action!=null)for(Key key:ALL)if(key.action().equals(action))return key;
        return null;
    }
    public static Key fromAndroid(int code) {for(Key key:ALL)if(key.android==code)return key;return null;}
    public static Key parse(String name) {
        String query=normalize(name);
        if(query.startsWith("key.keyboard."))query=query.substring(13);
        for(Key key:ALL) {
            if(normalize(key.title).equals(query))return key;
            for(String alias:key.aliases.split("\\|"))if(!alias.isEmpty() && normalize(alias).equals(query))return key;
        }

        return null;
    }
}
