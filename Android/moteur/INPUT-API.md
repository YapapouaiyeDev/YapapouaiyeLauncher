# Noyau des commandes tactiles

Le package `fr.yapapouaiye.moteur.input` est du Java portable, sans Android,
FCL, GLFW ni bibliothèque de jeu. Le moteur qui reçoit les événements choisit
ses propres codes de touches et consomme les deltas de caméra.

```java
TouchInputEngine input = new TouchInputEngine(new EventSink() {
    public void key(int code, boolean down) { /* moteur de jeu */ }
    public void look(float deltaX, float deltaY) { /* caméra relative */ }
}, new MovementKeys(87, 83, 65, 68));

input.press(12, "saut", 32);      // bouton maintenu par le doigt 12
input.joystick(3, 0f, -0.8f);    // avant, axe normalisé entre -1 et 1
input.beginLook(7, 100f, 200f);  // ancrage sans déplacement initial
input.moveLook(7, 110f, 205f);   // caméra +10, +5
input.releasePointer(12);       // relâche seulement ce doigt
input.cancelAll();              // relâche toutes les touches et captures
```

## Contrat pour une vue Android

- Utiliser `MotionEvent.getPointerId(index)`, jamais l'index comme identifiant.
- Sur `ACTION_DOWN` et `ACTION_POINTER_DOWN`, choisir une seule zone pour ce
  doigt : bouton, joystick ou caméra. Conserver cette capture jusqu'au UP.
- Pour le joystick, appeler `joystick(id, x, y)` avec les coordonnées relatives
  au centre divisées par le rayon. X positif va à droite et Y négatif en avant.
  Le moteur limite les valeurs à `[-1,1]`. Un seul doigt peut capturer le stick.
- `press` maintient une touche jusqu'au `releasePointer`. Répéter un press ne
  la bascule pas. Deux doigts maintenant la même touche ne se relâchent pas
  mutuellement. Le noyau ne transforme aucun bouton en interrupteur.
- Sur `ACTION_UP` ou `ACTION_POINTER_UP`, appeler `releasePointer` pour le
  doigt indiqué par `getActionIndex()`, y compris si le doigt a quitté le bouton.
- Sur `ACTION_CANCEL`, perte de focus, pause, détachement de la vue et
  remplacement des commandes, appeler `cancelAll` **et vider les captures
  conservées par la vue**. Ignorer les anciens MOVE jusqu'à un nouveau DOWN.
- Utiliser un seul thread pour les entrées, normalement le thread UI. Les
  callbacks sont synchrones et ne doivent pas modifier le noyau en réentrance.

Le stick engage un axe à `0,28` et le relâche à `0,18`. Cette hystérésis évite
les oscillations près du centre. Les seuils sont configurables par le
constructeur à quatre arguments. Les deltas caméra sont multipliés par
`setLookSensitivity(float)` et ne proviennent que du doigt capturé.

`InputState` peut aussi être utilisé séparément : `press(owner, key)`,
`release(owner, key)`, `releaseOwner(owner)`, `replace(owner, int...)` et
`releaseAll()`. Il n'envoie qu'un seul DOWN pour plusieurs propriétaires,
puis un seul UP au relâchement du dernier propriétaire.

## Tests JVM

Depuis la racine du projet, avec un JDK 17 ou ultérieur :

```powershell
.\Android\moteur\run-tests.ps1
```

Les tests utilisent les JAR JUnit 4 et Hamcrest existants dans
`Android/.build/test-libs`. Ils vérifient notamment le multitouch, les doigts
hors ordre, les changements de rôle, l'hystérésis, les entrées invalides, la
caméra, la perte de focus et des sessions aléatoires avec relâchement équilibré.
