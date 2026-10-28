# Moteur Android Yapapouaiye

Ce dossier contient la couche Java propre à Yapapouaiye pour les commandes tactiles et leur intégration à l'interface en jeu. Son objectif est de rendre les déplacements, la caméra, les boutons et les réglages cohérents dans le launcher et pendant une partie.

Minecraft Java reste le jeu exécuté. Le chargement du jeu, la JVM et la compatibilité graphique utilisent encore les composants FCL, OpenJDK et LWJGL distribués avec l'application. Ce module constitue un moteur de commandes et d'interface personnalisé ; il ne remplace pas ces composants par une nouvelle JVM ou par un nouveau moteur graphique Minecraft. Leur origine et leurs licences restent indiquées dans les sources et dans les notices de l'APK.

## Architecture

| Élément | Responsabilité |
| --- | --- |
| `input/EventSink.java` | Contrat de sortie : changement d'état d'une touche et déplacement relatif de la caméra. Aucun type Android ou FCL dans ce contrat. |
| `input/InputState.java` | Registre des touches et de leurs propriétaires. Une touche ne se relâche que lorsque son dernier propriétaire la relâche. |
| `input/MovementKeys.java` | Correspondance des quatre directions avec les codes du jeu fournis par l'adaptateur. |
| `input/GamepadBindings.java` | Catalogue des boutons et actions logiques de manette, valeurs par défaut et touches de repli. |
| `input/KeyboardKeys.java`, `android/KeyboardPickerDialog.java` | Catalogue validé des touches clavier, recherche et capture physique pour les boutons de manette. |
| `input/TouchButton.java`, `android/CustomButtons.java`, `android/CustomButtonsDialog.java` | Boutons clavier à l’écran, validation, sauvegarde, édition et visibilité tactile ou permanente. |
| `input/GamepadLook.java` | Vitesse de la caméra au stick droit, proportionnelle au temps écoulé et bornée après un blocage. |
| `input/TouchInputEngine.java` | Attribution des doigts aux boutons, au joystick ou à la caméra ; déplacements, sensibilité et annulation des commandes. |
| `android/TouchControlsView.java` | Vue propriétaire : conversion des `MotionEvent` en actions du moteur, dessin des commandes et gestion du cycle de vie de la vue. |
| `android/DeviceInputMode.java` | Inventaire des manettes physiques, distinct des claviers et périphériques virtuels. |
| `android/ControlSettings.java` | Préférences locales et valeurs bornées des commandes. |
| `android/ControlSettingsDialog.java` | Dialogue de réglages partagé par l'accueil et la partie. |
| `android/GamepadSettings.java`, `android/GamepadSettingsDialog.java` | Sauvegarde et édition des affectations des 16 boutons de manette. |
| `../src/YapapouaiyeGameMenu.java` | Adaptateur de compatibilité FCL : conversion des sorties du moteur vers les événements clavier, souris et caméra de la session Minecraft Java existante. |
| `../src/YapapouaiyeGamepad.java` | Application des affectations au contrôleur FCL, respect des touches Minecraft et regroupement des appuis simultanés. |

Les chemins `input/` et `android/` du tableau sont relatifs à `src/main/java/fr/yapapouaiye/moteur/`. La bibliothèque Android utilise l'espace de noms `fr.yapapouaiye.moteur` et sa configuration est dans `build.gradle.kts`. L'adaptateur reste dans les sources d'intégration de l'application et étend `GameMenu` pour conserver le contrat attendu par le runtime.

Le noyau `input` se teste sans lancer Android ni Minecraft. La vue connaît Android, l'adaptateur connaît FCL ; le noyau de commandes dépend seulement de son contrat de sortie. Les appels au moteur et ses rappels sont synchrones et doivent rester sur un même fil d'exécution, normalement le fil principal Android.

## Contrat des commandes

- Chaque doigt est identifié par son **identifiant de pointeur**, jamais par sa position dans le tableau des pointeurs Android. L'ordre de ce tableau peut changer quand un doigt se relève.
- Un doigt possède un rôle à la fois : bouton, déplacement ou caméra. Un autre doigt ne peut pas reprendre un joystick ou une caméra déjà occupés.
- Les boutons sont momentanés : appui pour maintenir, relâchement pour arrêter. Il n'y a pas de verrouillage implicite d'une touche après un simple appui.
- Deux sources qui tiennent la même touche produisent un seul appui logique ; le relâchement d'une seule source conserve l'action de l'autre.
- Le joystick utilise une zone neutre et deux seuils distincts pour engager puis relâcher une direction. Cela évite de faire alterner rapidement une touche près de son seuil. Le noyau produit les directions clavier du jeu ; il ne transforme pas ce déplacement en déplacement analogique Minecraft.
- La caméra s'ancre au point du premier contact sans saut initial et produit ensuite des déplacements relatifs affectés par la sensibilité.
- `releasePointer(id)` libère uniquement le doigt concerné. `cancelAll()` libère toutes les commandes du noyau et oublie les captures.

La vue doit appeler l'annulation à réception de `ACTION_CANCEL`, à la pause, à la perte de focus, au détachement, à un changement de disposition et avant l'ouverture d'un menu Android. Elle doit aussi vider ses propres captures et ignorer les mouvements tardifs sans nouvel appui. L'annulation du noyau seule ne remplace pas cette gestion des événements Android.

Les événements tactiles des menus Minecraft et ceux de la caméra ont des usages différents : déplacer la caméra exige le mode de capture de Minecraft ; sélectionner un élément d'interface exige des coordonnées de pointeur et un clic. Le changement de mode libère les commandes du jeu. Exception : un clic de menu qui reprend la capture (Réapparaître / Reprendre) conserve seulement son bouton de souris jusqu'au relâchement du même doigt, sans déplacer la caméra ; annulation et perte de focus le libèrent immédiatement.

## Menu et réglages

Le parcours en jeu utilise les commandes Yapapouaiye et son menu **Reprendre**, **Pause Minecraft**, **Clavier**, **Réglages** et **Aide**. L'ancien pavé tactile, les commandes personnalisables FCL, son bouton flottant et ses deux tiroirs sont remplacés pour ce parcours. Pause Minecraft envoie l'action de pause au jeu ; le menu Android du moteur est un panneau distinct.

Une manette connectée masque les commandes tactiles standard ; **Y · Menu** et les boutons personnalisés marqués **Toujours affiché** restent visibles. La déconnexion rétablit le tactile. L'édition et le laboratoire gardent leurs commandes. Les menus tactiles proposent la molette, le clavier Android avec envoi explicite Entrée, Espace et une bascule des commandes affichées entre jeu et menus. Le texte n'est ni enregistré par le launcher ni copié dans le presse-papiers. L'adaptateur attend l'ouverture du chat et le retour du focus avant envoi ; un délai dépassé annule la saisie avec un message.

**Mes boutons à l’écran** permet de créer jusqu’à 12 boutons, de choisir leur libellé et leur touche clavier, puis leur visibilité : **Toujours affiché** ou **Tactile seulement**. **Déplacer mes boutons** permet de les positionner. Le bouton initial **NexLux** envoie **Maj droite** et reste visible avec une manette. Les touches personnalisées passent directement au clavier du jeu, sans résolution des actions logiques Minecraft. Leur appui est partagé avec celui de la manette : relâcher une source ne relâche pas l’autre. La suppression d’un bouton tenu libère son appui.

**Manette · sensibilité et boutons** permet d'associer chaque bouton à une action, de désactiver son action ou de rétablir les valeurs par défaut. Les modifications restent provisoires jusqu'à **Appliquer**. Le profil commun aux manettes suit les touches Minecraft enregistrées ; les sticks conservent déplacement et caméra. La sensibilité du stick droit est sauvegardée dans `yapapouaiye-gamepad/lookSensitivity` et appliquée immédiatement en partie : 100 % = ancienne vitesse, 300 % = vitesse initiale de cette version, jusqu'à 2 000 % (×20). Le curseur des menus garde sa vitesse. Le choix du moteur graphique et le bouton **Profil Fluidité** s'appliquent au prochain lancement. Automatique utilise Zink avec le pilote Vulkan système pour Minecraft 26.2 et Krypton pour les autres versions.

| Préférence | Plage | Valeur initiale |
| --- | --- | --- |
| Sensibilité de la caméra tactile | 25 à 200 % | 85 % |
| Sensibilité du stick droit | 25 à 2 000 % | 300 % |
| Taille des commandes | 75 à 140 % | 100 % |
| Opacité des commandes | 25 à 95 % | 70 % |
| Disposition gaucher | Activée ou désactivée | Désactivée |
| Résolution de rendu | 50 à 100 % | 100 % |

Ces préférences sont conservées dans les `SharedPreferences` Android. Réduire la résolution modifie la définition du rendu, avec un compromis entre finesse de l'image et charge graphique ; le gain réel dépend du téléphone, du rendu et des mods. Le libellé de l'interface précise les réglages qui exigent un nouveau lancement.

Le bouton **Touche clavier…** du choix d'action ouvre une recherche et une liste de touches. La capture physique attend le relâchement de la touche, ignore les boutons de manette et ne transmet rien au jeu. Les profils enregistrent uniquement un identifiant `key:<code>` présent dans le catalogue ; les valeurs inconnues ou les codes de souris ne sont pas acceptés. Ces affectations contournent la résolution des raccourcis logiques Minecraft et passent ensuite par le même registre d'appuis que les actions existantes.

## Intégration et entretien

Les sources de ce dossier sont maintenues dans le dépôt Yapapouaiye. Les adaptations du code amont sont appliquées par `../patch-upstream.cjs` pendant la préparation de la compilation ; modifier uniquement le cache `../.build/upstream` ne suffit pas pour conserver un changement.

La provenance des dépendances et les sources correspondantes doivent accompagner l'APK, y compris ce dossier. Un changement de menu ou de marque ne change pas l'origine du runtime Java et du rendu. La compilation Android et l'export des sources restent décrits dans `../README.md`.

Les critères de validation et les scénarios sur appareil sont dans [VALIDATION.md](VALIDATION.md). Une compilation ou un test du noyau ne valide pas à elle seule la maniabilité dans une partie réelle.
