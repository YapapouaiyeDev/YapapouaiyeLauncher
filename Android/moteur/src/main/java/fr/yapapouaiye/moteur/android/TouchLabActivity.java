/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.*;
import android.widget.*;
import java.util.*;

/** Local test surface, explicitly simulated; never starts or modifies a Minecraft world. */
public final class TouchLabActivity extends Activity {
    private TouchControlsView controls;
    private final Set<Integer> held = new TreeSet<>();
    private TextView status;
    private boolean game = true;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(5894);
        FrameLayout frame = new FrameLayout(this);frame.setBackgroundColor(Color.rgb(12,24,29));
        status = new TextView(this);status.setGravity(Gravity.CENTER);status.setTextColor(Color.rgb(170,213,198));status.setTextSize(17);
        frame.addView(status,new FrameLayout.LayoutParams(-1,-1));
        controls = new TouchControlsView(this,new TouchControlsView.Host() {
            public void key(int code,boolean down) { if(down)held.add(code);else held.remove(code);update(); }
            public void look(float dx,float dy) { status.setText("Banc d’essai · caméra " + Math.round(dx) + ", " + Math.round(dy) + "\nTouches maintenues : " + held); }
            public void pointer(float x,float y) { }
            public void mouse(boolean down) { if(down)held.add(1000);else held.remove(1000);update(); }
            public void keyboard() { Toast.makeText(TouchLabActivity.this,"Clavier simulé dans ce banc d’essai",Toast.LENGTH_SHORT).show(); }
            public void pauseGame() { game=!game;controls.setInGame(game);update(); }
        });
        controls.setTouchControlsForced(true);
        frame.addView(controls,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);update();
    }
    private void update() { status.setText("Banc d’essai · aucun jeu lancé\n"+(game ? "Déplacement et caméra" : "Menus tactiles simulés")+"\nTouches maintenues : "+held+"\nY · Menu → Déplacer les touches pour personnaliser"); }
    @Override public void onBackPressed() { if(controls.isEditing())controls.setEditing(false);else super.onBackPressed(); }
    @Override protected void onPause() { controls.suspendControls();super.onPause(); }
    @Override protected void onResume() { super.onResume();if(controls!=null)controls.resumeControls(); }
}
