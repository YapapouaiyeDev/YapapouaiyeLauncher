# Validation du moteur Android

## Complément du 28 octobre 2026 — 1.0.3-A

- La vérification réelle du flux public a révélé un refus HTTP 403 de l'API GitHub, avec quota épuisé. La version stable utilise désormais le manifeste du site officiel en priorité ; GitHub reste en secours.
- Deux scénarios JVM supplémentaires couvrent la découverte sans API GitHub, le repli en cas de manifeste indisponible ou malformé et l'absence de repli après annulation. Les contrôles de taille, SHA-256, version, package et signature restent actifs.
- Les corrections manette de 1.0.2-A sont conservées. La validation physique en jeu reste à effectuer.

## Exécution du 28 octobre 2026 — 1.0.2-A

- Compilation ARM64 réussie ; **56 tests JVM du moteur et 47 tests JVM de l'application**, sans échec.
- **8 tests de compatibilité** et **3 tests de configuration Firebase** réussis.
- Le test du code Java généré maintient le déplacement sur 1 000 échantillons sans relâchement intermédiaire, conserve l'avance lors du passage en diagonale et vérifie le relâchement au centre.
- Le même test vérifie une caméra à 120 Hz sans nouveaux événements manette, sans émission supplémentaire pendant les changements d'axes, et limite le déplacement après une image retardée. Les tests de cycle de vie conservent les protections contre pause, perte de focus, anciens rappels et déconnexion.
- La vue de compatibilité applique les axes du remappeur ensemble à la fin de chaque événement Android ; les changements de direction n'émettent que les transitions nécessaires.
- Aucun contrôleur physique détecté sur le téléphone pendant cette vérification. La fluidité en partie réelle et les FPS ne sont pas mesurés. L'installation demandée au téléphone a été annulée par Xiaomi (`INSTALL_FAILED_USER_RESTRICTED`) ; aucune désinstallation ni suppression de données effectuée.

## Exécution du 27 octobre 2026

- Compilation APK ARM64 réussie, identité et signature v2/v3 vérifiées.
- **34 tests JVM du moteur réussis**, dont propriété des touches, joystick, caméra, annulation et liaisons souris modernes/anciennes. La suite de l'application ajoute **28 tests JVM réussis**, soit **62 tests JVM au total**.
- **3 tests de compatibilité réussis**, dont un programme Java exécutant les remises à zéro et les rappels de manette générés par le patch.
- **1 test Playwright de l'accueil réussi** (comptes simulés, codes, réglages, états de préparation et mises à jour).
- **14 scénarios de la vue Android exécutés avec succès sur le téléphone 24090RA29G sous Android 16**, via `ControlsInstrumentation`, dans le profil utilisateur ouvert 0, sur le build précédent des contrôles. Ils couvrent le routage multitouch et des menus avec un récepteur de commandes simulé. La nouvelle exécution sur l'APK final n'a pas pu être lancée : l'installateur Xiaomi a refusé le paquet secondaire de test avec `INSTALL_FAILED_USER_RESTRICTED`.
- Compagnon Android : **27 vérifications du contrôleur commun et 2 tests du sous-écran de chat réussis**.
- APK final de l'application installé avec succès avec `adb install --user 0 -r`, sans désinstaller l'application ; le refus Xiaomi ne concerne que le paquet de test secondaire.
- SHA-256 de l'APK final : `66d6e48484fe7798406323585cd56936d16b74a8fc89a8e43cf876d11a9c5f0e`.

### Périmètre de cette correction

- Fusion du catalogue public dans `servers.dat` pour chaque profil Minecraft ; conservation des serveurs personnels et de leurs métadonnées, mise à jour des entrées gérées et sauvegarde du fichier initial.
- Normalisation des adresses de serveur dont `host` contenait déjà un port, notamment AdoServSE, avec utilisation du port de jeu et prise en charge IPv6.
- Masquage automatique des touches tactiles à la détection d'une manette et retour au tactile après déconnexion.
- Clic de menu conservé jusqu'au relâchement du doigt, défilement à la molette, clavier Android natif pour le chat et actions Entrée/Espace.
- Compagnon client Android pour NeoForge 26.2 et 1.21.1 : F8 ouvre le chat uniquement sur l'écran de mort. Ce mod est distinct de NexLux et ne modifie pas les JAR du launcher PC.

Lors de la consultation du catalogue API, AdoServSE et AdoServLXVII étaient actifs ; AdoServII et YapapouaiyeSMP étaient désactivés. Ces deux derniers ne doivent pas être ajoutés à la liste des serveurs actifs.

Les événements Android sont injectés dans la vraie vue sur le téléphone, avec un récepteur de jeu simulé. Ils ne mesurent pas les mouvements physiques des doigts, la réception des commandes dans Minecraft, une partie en ligne ni les FPS. La capture `Android/dist/moteur-controles.png` montre ce banc, pas Minecraft.

L'inventaire du téléphone relevait **0 manette physique**. La détection et le masquage peuvent être vérifiés par simulation, mais le branchement, les commandes et la déconnexion d'une manette réelle restent à tester. Les essais Minecraft réels de cette correction ont confirmé la connexion à AdoServSE, la liste multijoueur et l'ouverture du véritable chat depuis l'écran de mort. **L'authentification du serveur, la réapparition après cette authentification et les FPS ne sont pas validés. Aucun mot de passe n'a été saisi pendant les essais.**

### Partie réelle — résultats et vérifications restantes

- Téléphone 24090RA29G, Android 16, profil utilisateur 0.
- APK 1.6.1-4 ARM64 ; AdoServSE, Minecraft 26.2 : connexion réelle réussie.
- Liste multijoueur vérifiée sur téléphone : le serveur personnel « Minecraft Server », déjà associé au même endpoint qu'AdoServSE, est conservé sans doublon ; AdoServLXVII est ajouté et visible.
- Sur l'écran de mort d'AdoServSE en 26.2, le bouton Chat émet F8 et ouvre le véritable `ChatScreen`. La capture `Android/.build/chat-mort-verifie.png` montre le prompt YAuthM demandant `/login` et les messages du serveur.
- Retour/Échap revient à un nouvel écran « You Died » ; ses boutons reprennent le délai vanilla de 20 ticks. Une déconnexion « Délai d'authentification dépassé » après 120 secondes a également été observée.
- Aucun mot de passe saisi. L'authentification YAuthM et la réapparition après connexion restent à vérifier par le joueur ; la seule ouverture du chat ne valide pas une réapparition autorisée par le serveur.
- Clavier Android natif et Entrée : la saisie `localhost:1` dans le champ de connexion directe produit une connexion refusée attendue, confirmant la transmission réelle des caractères et de la validation. Ce résultat ne valide pas une authentification de serveur.
- Espace, maintien du clic jusqu'au relâchement et défilement dans les menus : résultats réels à compléter.
- Manette physique, masquage des touches et retour au tactile après déconnexion : non testé, aucune manette détectée.
- FPS, irrégularités de rendu et température avant/après : aucune mesure comparative.

Les cases ci-dessous servent de liste pour les autres vérifications, notamment en partie réelle. Elles ne signifient pas que tous les parcours ont été testés.

Ce document définit les vérifications à effectuer. Les cases vides ne constituent pas des résultats de tests. Consigner les exécutions réelles dans le rapport livré avec l'APK, en indiquant la date, le téléphone ou l'émulateur, Android, la version de l'APK, le serveur et la version de Minecraft.

## Noyau Java

Utiliser un récepteur `EventSink` de test qui enregistre, dans l'ordre, les appuis, relâchements et déplacements de caméra. Vérifier le résultat observable plutôt que l'organisation interne des classes.

- [ ] Un appui répété par le même propriétaire produit un seul événement d'appui, puis un seul relâchement.
- [ ] Deux propriétaires de la même touche : le premier relâchement conserve la touche ; le second la relâche.
- [ ] Deux boutons différents sur deux doigts fonctionnent ensemble ; relever un doigt ne relâche pas l'autre.
- [ ] Remplacer le rôle d'un doigt libère ses anciennes actions sans modifier celles des autres doigts.
- [ ] Joystick : directions cardinales, diagonales, retour au centre, changement de direction et maintien près des deux seuils.
- [ ] Un second doigt ne vole pas le joystick ou la caméra déjà capturés.
- [ ] Caméra : aucun déplacement au premier contact, deltas corrects ensuite et application de la sensibilité.
- [ ] Valeurs non finies : aucune commande de caméra invalide ; le joystick revient au neutre.
- [ ] `releasePointer()` et `cancelAll()` répétés ne laissent ni touche enfoncée ni événement de relâchement en double.
- [ ] Après annulation, une nouvelle session commence avec un état neutre.

## Routage Android et multitouch

Un test d'instrumentation peut construire des `MotionEvent` avec plusieurs `PointerProperties` et `PointerCoords`, puis les transmettre à la vue sur le fil principal ou avec l'instrumentation. Les événements doivent conserver les mêmes identifiants, `downTime` et coordonnées cohérentes pendant un geste ; les actions `ACTION_POINTER_DOWN` et `ACTION_POINTER_UP` doivent encoder le bon index d'action. Recycler chaque événement après sa transmission.

Exemple de séquence à tester : doigt d'identifiant 3 sur le joystick, doigt 8 sur la caméra, doigt 12 sur Saut, déplacement des trois, relâchement du doigt 3, puis mouvement des doigts 8 et 12 dans un tableau devenu plus court. La caméra et Saut doivent continuer sans hériter du rôle du doigt 3. Répéter en changeant l'ordre des relâchements.

- [ ] `ACTION_DOWN`, `ACTION_POINTER_DOWN`, `ACTION_MOVE`, `ACTION_POINTER_UP` et `ACTION_UP` suivent les identifiants malgré les changements d'indices.
- [ ] Déplacer + regarder + sauter fonctionne avec trois contacts simultanés.
- [ ] Relâcher hors du bouton ou hors du joystick libère toujours l'action capturée.
- [ ] Un `ACTION_CANCEL` libère tous les contacts, y compris les boutons dont le relâchement n'arrive jamais.
- [ ] Ouvrir le menu, retirer la vue ou perdre le focus pendant un appui libère les commandes ; les anciens `MOVE` ne les réactivent pas.
- [ ] Après fermeture du menu, un nouveau geste fonctionne immédiatement sans saut de caméra.
- [ ] Un redimensionnement ou changement d'orientation ne conserve pas les anciennes coordonnées ou captures.

`adb shell input tap` et `adb shell input swipe` servent à des gestes simples ; ils ne suffisent pas à établir que le multitouch fonctionne. Une injection directe dans la vue valide son routage mais ne reproduit pas entièrement l'écran tactile, l'interception des gestes Android ou la capture des pointeurs dans une partie. Les scénarios suivants restent nécessaires sur téléphone.

Un banc de test Android de la vue avec un récepteur de commandes fictif peut isoler ces gestes sans télécharger ni démarrer Minecraft. Qualifier explicitement ses résultats de **simulation du pont de jeu** : ils peuvent confirmer les actions envoyées et le dessin des commandes, sans confirmer que le jeu les reçoit correctement. N'annoncer l'exécution de ce banc que si l'activité correspondante existe et a réellement été lancée dans l'APK testé.

## Partie réelle sur téléphone

- [ ] Lancer Minecraft depuis Yapapouaiye, rejoindre le serveur puis retrouver une interface de commandes et un menu Yapapouaiye cohérents.
- [ ] Marcher, regarder, sauter, frapper, utiliser et ouvrir l'inventaire ; vérifier que chaque action s'arrête au relâchement.
- [ ] Maintenir une action, ouvrir le menu Android du moteur puis revenir : aucune marche, attaque ou touche bloquée.
- [ ] Maintenir une action puis utiliser Accueil Android, les applications récentes, une notification ou un dialogue ; revenir et vérifier l'état neutre.
- [ ] Ouvrir puis fermer l'inventaire et le menu pause Minecraft pendant des gestes : pas de caméra active dans les menus et clics utilisables.
- [ ] Vérifier le curseur masqué en partie, sa préférence dans les menus et la sélection des boutons Minecraft dans les deux réglages proposés.
- [ ] Modifier les réglages effectivement exposés, reprendre la partie puis relancer l'application : effet et conservation conformes au libellé.
- [ ] Tester les bornes de sensibilité, taille, opacité et résolution, ainsi que la disposition gaucher ; les cibles restent accessibles et les commandes se relâchent après toute modification.
- [ ] Si une manette physique est utilisée, vérifier appuis, relâchements, mode tactile/manette et déconnexion pendant une action.
- [ ] Se déconnecter du serveur puis relancer une partie sans toucher à la disposition : aucun état d'entrée hérité.

## Affichage et performances

- [ ] Vérifier une petite et une grande surface de jeu : boutons lisibles, cibles accessibles, commandes sans recouvrement gênant et menu qui tient à l'écran.
- [ ] Vérifier les bords et encoches de l'écran, le clavier logiciel et le retour du clavier sans déplacement durable du jeu.
- [ ] Parcourir premier démarrage, préparation Java, lancement, menu en partie et retour au launcher ; relever tout écran technique encore exposé dans le parcours normal.
- [ ] Mesurer une même scène, avec les mêmes mods, résolution et paramètres, avant et après le changement ; noter FPS, irrégularités de rendu et température après stabilisation.
- [ ] Maintenir plusieurs contacts puis les relâcher en répétant le geste : pas de travail continu de caméra ou d'entrée après le relâchement, pas de dégradation progressive.

Une amélioration de performances exige une mesure comparable. La présence d'un nouveau module de commandes ne démontre pas une hausse du nombre d'images par seconde ni une compatibilité universelle avec les mods.
