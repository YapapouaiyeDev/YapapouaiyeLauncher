# Veille réseau des comptes Minecraft

Les boutons Contrôle et Sans fenêtre restent supprimés. Chaque compte conserve
sa fenêtre et sa connexion Minecraft. Dans Échap, **Mettre en veille** permet de
figer le monde local et de suspendre son flux réseau quand le serveur est compatible.

## Client et serveur à mettre à jour

Installer le NexLux correspondant à la version **sur le client et le serveur**,
puis redémarrer le serveur :

- Minecraft 1.21.1 : `mods/nexlux-1.1.0.jar`.
- Minecraft 26.2 : `mods/nexlux-26.2.jar`.

Aucun serveur existant n'a été mis à jour par ces changements. Les JAR sont
préparés localement ; le parcours avec un véritable joueur reste à valider.

## Pendant la veille

Le client vérifie d'abord la capacité du serveur sur le canal optionnel NexLux.
Il ne fige sa simulation qu'après confirmation du serveur. Un ancien serveur
reste utilisable en veille graphique ; l'écran indique clairement cette limite.

Le serveur suspend l'envoi des chunks, entités, blocs, sons, particules, chat,
listes de joueurs et données de mods vers ce compte. Les batches de chunks sont
suspendus avant leur création ; les messages de chat signés ne créent plus de
confirmations attendues du joueur endormi. Les autres joueurs restent actifs.

Les keepalives, pings et corrections de position nécessaires à une confirmation
de téléportation continuent. Une déconnexion, un transfert ou une reconfiguration
peut toujours parvenir au client et ouvre le filtre. Un silence TCP absolu ne
permettrait pas de garantir le maintien de la connexion.

Côté client, les ticks du monde, des entités et des animations de blocs sont
suspendus. Le rendu 3D et son extraction restent coupés, l'écran est limité à
5 images/seconde. Les sons sont mis en pause et les touches relâchées. Le cache
de chunks est réduit après confirmation et les particules sont libérées. Une
demande ponctuelle de nettoyage Java est programmée ; le minimum du tas est de
256 Mo, avec le maximum choisi par le joueur inchangé.

La JVM, les mods et une partie de l'état du monde restent chargés. Ce mode ne
promet pas un client limité aux seuls octets du protocole ni un plafond de RAM.
Les règles serveur, dégâts et expulsions AFK continuent de s'appliquer au joueur.

## Reprise

**Reprendre le jeu** ou Échap demande au serveur l'état courant. Le filtre est
levé avant la reconstruction du monde client, des chunks et des entités. Le monde
local reste figé jusqu'à la fin de cette synchronisation. Le même personnage,
son inventaire et sa connexion sont conservés. Une mort survenue pendant la
veille est présentée au retour.

Une déconnexion normale de Minecraft efface l'état de veille et restaure le
son. Une nouvelle connexion ne réutilise pas l'ancien état de gel ; un rappel
de déconnexion retardé de l'ancien serveur ne réinitialise pas le nouveau.

## Compilation et tests

- `scripts/build-companion-26.2.ps1` : compagnon complet Java 25 / NeoForge 26.2.0.93.
- `scripts/build-companion-standby-1.21.1.ps1` : module natif Java 21 / NeoForge 21.1.264.
  Les paramètres `-GameRoot` et `-JdkPath` permettent un cache de compilation séparé.

Chaque version est compilée avec ses dépendances natives. Les scripts actualisent
les copies distribuées dans `mods/` et `src/assets/`.

`node --test scripts/test-game-sessions.cjs scripts/test-standby-client.cjs scripts/test-network-standby.cjs`

Les tests exercent les classes des JAR distribués, les paquets autorisés/bloqués,
le gel et la reprise, les annulations, les autres comptes et les cibles des mixins
sur les API Minecraft natives disponibles. Ils ne remplacent pas une session réelle.
