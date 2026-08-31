# NexLux — API d'informations serveur & joueurs (NeoForge 1.21.1)

**NexLux** est un mod serveur NeoForge (l'équivalent d'un « plugin » sur les serveurs
moddés) qui rend triviale la récupération des informations du serveur :
**joueurs en ligne, liste des joueurs, TPS, version, motd, uptime…**

- Une **API HTTP JSON** intégrée (`/api/status`, `/api/players`, `/api/tps`…) —
  consommable par le launcher, un site web, un bot Discord, etc.
- Un **tableau de bord web** (`http://<ip>:8080/`) qui affiche en direct le nombre
  de joueurs et la **tête (avatar) de chaque joueur**, avec actualisation auto.
- Des **commandes en jeu** (`/nexlux status`, `/nexlux players`…).
- Une **configuration** simple (`config/nexlux.json`) avec jeton d'authentification
  optionnel et CORS.

> ⚠️ Ce projet utilise **NeoForge 1.21.1** (version 21.1.248). Il ne fonctionne pas
> sur les serveurs Paper/Spigot/Bukkit.

---

## Prérequis

| Élément | Version |
|---------|---------|
| JDK | 21 (64 bits) |
| Minecraft | 1.21.1 |
| NeoForge | 21.1.x (testé avec 21.1.248) |

## Compilation

```bash
cd LePlugin
./gradlew build          # Windows : gradlew.bat build
```

Le fichier `build/libs/nexlux-1.0.0.jar` est généré. Le premier build télécharge
Gradle et les dépendances NeoForge (peut prendre plusieurs minutes).

## Installation sur le serveur

1. Copier `nexlux-1.0.0.jar` dans le dossier `mods/` du serveur (celui qui contient
   les autres mods NeoForge).
2. Redémarrer le serveur. Le fichier de configuration
   `config/nexlux.json` est créé automatiquement.
3. Vérifier dans la console : `NexLux : API HTTP démarrée sur http://0.0.0.0:8080`.

## Configuration

Fichier : `config/nexlux.json`

```json
{
  "api": {
    "enabled": true,        // active/désactive l'API HTTP
    "host": "0.0.0.0",      // 0.0.0.0 = accessible depuis l'extérieur, 127.0.0.1 = local uniquement
    "port": 8080,           // port d'écoute
    "token": "",            // jeton optionnel ; s'il est renseigné, toute requête doit fournir Authorization: Bearer <jeton>
    "cors": true            // autorise les appels depuis un navigateur (Access-Control-Allow-Origin: *)
    "avatarUrl": "https://mc-heads.net/avatar/{name}/64"  // modèle d'URL des têtes ; {name} ou {uuid} ; vide = pas d'avatars
  },
  "showPlayerIp": false     // afficher l'IP de chaque joueur dans l'API (confidentialité)
}
```

Après modification : `/nexlux reload` (op) ou redémarrage du serveur.

## Tableau de bord web

Ouvrez simplement **`http://<ip-du-serveur>:8080/`** dans un navigateur :

- **nombre de joueurs en ligne** affiché en grand (ex. `3 / 20 joueurs en ligne`) ;
- la **tête de chaque joueur** (avatar mc-heads.net) avec son pseudo et son ping ;
- statistiques serveur : TPS, MSPT, version, uptime, motd ;
- actualisation automatique toutes les 5 secondes.

Si un jeton est configuré, ajoutez-le à l'URL : `http://<ip>:8080/?token=VOTRE_JETON`.

## API HTTP

### `GET /api/status` — statut complet

```json
{
  "online": true,
  "server": {
    "motd": "A Minecraft Server",
    "version": "1.21.1",
    "neoforge": "21.1.248",
    "protocol": 767,
    "onlineMode": true,
    "whitelist": false,
    "difficulty": "EASY",
    "tick": 5056,
    "uptimeSeconds": 252
  },
  "players": {
    "online": 3,
    "max": 20,
    "list": [
      {
        "name": "Steve",
        "uuid": "8667ba71-b85a-4004-af54-457a9734eed7",
        "ping": 23,
        "gamemode": "survival",
        "world": "minecraft:overworld",
        "x": 1.5,
        "y": 64.0,
        "z": 2.3,
        "health": 20.0,
        "level": 12,
        "itemInHand": "Diamond Sword",
        "headUrl": "https://mc-heads.net/avatar/Steve/64"
      }
    ]
  },
  "tps": {
    "tps": 20.0,
    "tps1m": 20.0,
    "tps5m": 19.98,
    "tps15m": 19.9,
    "mspt": 50.0
  },
  "plugin": {
    "name": "NexLux",
    "id": "nexlux",
    "version": "1.0.0"
  }
}
```

### Autres endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | **Tableau de bord web** (nombre de joueurs + têtes des joueurs) |
| `GET /api` | Index JSON des endpoints |
| `GET /api/health` | Test de disponibilité (`status`, `serverOnline`, uptime) |
| `GET /api/players` | Compteur (`online`/`max`) et liste des joueurs (avec `headUrl`) |
| `GET /api/player/<pseudo>` | Détail d'un joueur connecté (insensible à la casse) |
| `GET /api/tps` | TPS 1/5/15 min et MSPT |

### Authentification

Si `api.token` est renseigné, chaque requête doit inclure :

```
Authorization: Bearer <jeton>
```

ou en query string : `?token=<jeton>`.

Chaque joueur de la liste expose son **avatar** via le champ `headUrl`
(généré depuis `api.avatarUrl`, placeholders `{name}` et `{uuid}`).

### Exemples

```bash
curl http://localhost:8080/api/status
curl -H "Authorization: Bearer monJeton" http://serveur:8080/api/player/Steve
```

## Commandes en jeu

| Commande | Description |
|----------|-------------|
| `/nexlux status` | Résumé : joueurs, TPS, uptime, mode |
| `/nexlux players` | Liste des joueurs connectés |
| `/nexlux api` | État et adresse de l'API HTTP |
| `/nexlux reload` | Recharge la configuration (op uniquement) |

## Intégration avec le launcher

Le launcher peut interroger l'API à la place du ping Minecraft classique :

```js
const res = await fetch("http://<ip-du-serveur>:8080/api/status");
const data = await res.json();
console.log(`${data.players.online}/${data.players.max} joueurs en ligne`);
```

> Pensez à ouvrir le port de l'API (8080 par défaut) dans le pare-feu / le panneau
> d'hébergement si vous voulez y accéder depuis l'extérieur.

## Sécurité

- Par défaut l'API est **ouverte** (aucun jeton) : ne l'exposez pas publiquement
  sans définir un `token`, surtout si `showPlayerIp` est activé.
- Le jeton est comparé en temps constant (résistant aux attaques temporelles).
- Les endpoints sont en lecture seule : aucune donnée ne peut être modifiée via l'API.

## Structure du projet

```
LePlugin/
├── build.gradle / settings.gradle / gradle.properties   # build NeoForge (ModDevGradle)
├── gradlew / gradlew.bat / gradle/                      # wrapper Gradle 8.14.2
└── src/main/
    ├── java/fr/yapapouaiye/nexlux/
    │   ├── NexLux.java               # point d'entrée du mod
    │   ├── NexLuxConfig.java         # config/nexlux.json
    │   ├── NexLuxCore.java           # cœur : snapshots + cycle de vie
    │   ├── NexLuxEvents.java         # événements NeoForge
    │   ├── api/ApiServer.java        # serveur HTTP JSON
    │   ├── command/NexLuxCommands.java
    │   ├── data/                     # snapshots immutables (joueur, serveur)
    │   └── util/TpsTracker.java      # mesure TPS 1/5/15 min
    └── resources/META-INF/neoforge.mods.toml
```

## Licence

MIT — Yapapouaiye Studios.
