/**
 * YAPAPOUAIYE LAUNCHER - DATABASE ABSTRACTION LAYER (Cloudflare D1 / SQLite / R2 / Fallback)
 */

const DEFAULT_NEWS_JSON = [
  {
    "id": "news-1",
    "title": "Mise à jour NeoForge 1.21.1 & Optimisations Générales",
    "badge": "Mise à jour",
    "version": "v1.5.6",
    "date": "14 août 2026",
    "author": "L'équipe Yapapouaiye",
    "featured": true,
    "summary": "Le serveur et le launcher passent sous NeoForge 1.21.1 avec des gains majeurs de fluidité et une gestion avancée de la mémoire vive.",
    "content": "### 🚀 Nouveautés de la version 1.5.6\n\nLe serveur Yapapouaiye utilise désormais **Minecraft 1.21.1 sous NeoForge** !\n\n- **Fluidité accrue** : Réduction du temps de chargement des chunks et allocation RAM optimisée.\n- **Éditeur Visuel Studio** : Personnalisez entièrement l'interface du launcher, les biseaux, les nuances et les effets sonores en temps réel.\n- **Nouveaux sons au clic** : Sons de pierre, bois, laser et néon futuriste configurables.\n- **Support multi-comptes** : Basculez entre vos comptes Microsoft et Offline en un seul clic.",
    "image": "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80"
  },
  {
    "id": "news-2",
    "title": "Synchronisation Automatique des Mods via Gitea",
    "badge": "Modpack",
    "version": "v1.5.0",
    "date": "12 août 2026",
    "author": "Admin",
    "featured": false,
    "summary": "Plus besoin de télécharger manuellement les .jar : vos mods sont vérifiés par somme de contrôle SHA et synchronisés automatiquement avant le lancement.",
    "content": "### 📦 Système de Synchronisation Intelligente\n\nFini les erreurs de compatibilité et les fichiers manquants !\n\n1. Le launcher interroge le dépôt officiel des mods.\n2. Seuls les mods modifiés ou ajoutés sont téléchargés grâce au système de delta SHA.\n3. Vos mods personnalisés situés dans `mods-custom/` sont préservés à 100 %.\n4. Lancement direct et connexion automatique en un clic.",
    "image": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80"
  },
  {
    "id": "news-3",
    "title": "Grand Événement Mini-Jeux & Tournoi de la Rentrée",
    "badge": "Événement",
    "version": "Serveur",
    "date": "10 août 2026",
    "author": "Voyzix & MrLapin",
    "featured": false,
    "summary": "Rejoignez-nous ce week-end pour l'ouverture des arènes personnalisées et remportez des récompenses exclusives en jeu !",
    "content": "### 🏆 Tournoi Inter-Joueurs\n\nPréparez vos épées et vos potions ! Nous organisons une session spéciale de mini-jeux avec diffusion en direct sur YouTube.\n\n- **Date** : Samedi à 20h00 (Heure de Paris)\n- **Accès** : Serveur Officiel Yapapouaiye via le Launcher\n- **Récompenses** : Rangs cosmétiques uniques, thèmes exclusifs et dédicaces en live !",
    "image": "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80"
  }
];

/**
 * Returns the D1 database binding if available
 */
export function getD1Binding(env) {
  if (!env) return null;
  return env.DB || env.DATABASE || env.NEWS_DB || null;
}

/**
 * Initialize SQL tables if they do not exist
 */
export async function ensureTable(env) {
  const db = getD1Binding(env);
  if (!db) return false;

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        badge TEXT DEFAULT 'Mise à jour',
        version TEXT DEFAULT '',
        date TEXT NOT NULL,
        author TEXT DEFAULT 'Admin',
        featured INTEGER DEFAULT 0,
        summary TEXT DEFAULT '',
        content TEXT NOT NULL,
        image TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_featured ON news(featured DESC, created_at DESC);
    `);
    return true;
  } catch (err) {
    console.warn("[DB] Error ensuring table:", err.message);
    return false;
  }
}

/**
 * Read news list from fallback (R2 or static news.json)
 */
async function getFallbackNews(env, origin = "") {
  if (env && env.LAUNCHER_BUCKET) {
    try {
      const obj = await env.LAUNCHER_BUCKET.get("news.json");
      if (obj) {
        const text = await obj.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.entries)) return parsed.entries;
        if (Array.isArray(parsed.news)) return parsed.news;
      }
    } catch (e) {
      console.warn("[DB Fallback] Erreur lecture R2:", e.message);
    }
  }

  if (origin) {
    try {
      const res = await fetch(`${origin}/news.json`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {
      console.warn("[DB Fallback] Erreur fetch origin /news.json:", e.message);
    }
  }

  // Do not fall back to GitHub releases here: this endpoint is reserved for administration posts.
  return [];
}

/**
 * Save news list to fallback (R2)
 */
async function saveFallbackNews(env, newsList) {
  if (env && env.LAUNCHER_BUCKET) {
    try {
      const content = JSON.stringify(newsList, null, 2);
      await env.LAUNCHER_BUCKET.put("news.json", content, {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
        },
      });
      return true;
    } catch (e) {
      console.warn("[DB Fallback] Erreur écriture R2:", e.message);
    }
  }
  return false;
}

/**
 * Normalizes a database row to standard News JSON object
 */
function normalizeNewsRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title || ""),
    badge: String(row.badge || "Mise à jour"),
    version: String(row.version || ""),
    date: String(row.date || ""),
    author: String(row.author || "Admin"),
    featured: Boolean(row.featured == 1 || row.featured === true),
    summary: String(row.summary || ""),
    content: String(row.content || ""),
    image: String(row.image || ""),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

/**
 * Fetch all news from the Database (with automatic fallback)
 */
export async function getAllNews(env, origin = "", filters = {}) {
  const db = getD1Binding(env);

  if (db) {
    try {
      await ensureTable(env);
      let query = `
        SELECT id, title, badge, version, date, author, featured, summary, content, image, created_at, updated_at
        FROM news
        ORDER BY featured DESC, created_at DESC, id DESC
      `;
      const result = await db.prepare(query).all();
      let rows = (result && result.results) ? result.results : [];

      let list = rows.map(normalizeNewsRow);

      // Apply filtering if provided
      if (filters.badge && filters.badge !== "tous" && filters.badge !== "all") {
        list = list.filter(n => n.badge.toLowerCase().includes(filters.badge.toLowerCase()));
      }
      if (filters.featured === true || filters.featured === "true") {
        list = list.filter(n => n.featured === true);
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        list = list.filter(n =>
          n.title.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.version.toLowerCase().includes(q)
        );
      }
      if (filters.limit && !isNaN(parseInt(filters.limit, 10))) {
        list = list.slice(0, parseInt(filters.limit, 10));
      }

      return list;
    } catch (err) {
      console.warn("[DB] Error in getAllNews:", err.message);
    }
  }

  // Fallback if D1 is not available or errored
  let fallbackList = await getFallbackNews(env, origin);
  let list = fallbackList.map(normalizeNewsRow);

  if (filters.badge && filters.badge !== "tous" && filters.badge !== "all") {
    list = list.filter(n => n.badge.toLowerCase().includes(filters.badge.toLowerCase()));
  }
  if (filters.featured === true || filters.featured === "true") {
    list = list.filter(n => n.featured === true);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.summary.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.version.toLowerCase().includes(q)
    );
  }
  if (filters.limit && !isNaN(parseInt(filters.limit, 10))) {
    list = list.slice(0, parseInt(filters.limit, 10));
  }

  return list;
}

/**
 * Fetch a single news entry by ID
 */
export async function getNewsById(env, id, origin = "") {
  if (!id) return null;
  const db = getD1Binding(env);

  if (db) {
    try {
      await ensureTable(env);
      const row = await db.prepare("SELECT * FROM news WHERE id = ?").bind(id).first();
      if (row) return normalizeNewsRow(row);
    } catch (err) {
      console.warn("[DB] Error in getNewsById:", err.message);
    }
  }

  const all = await getFallbackNews(env, origin);
  const found = all.find(n => n.id === id);
  return found ? normalizeNewsRow(found) : null;
}

/**
 * Create a new news entry in the database
 */
export async function createNews(env, item, origin = "") {
  const db = getD1Binding(env);
  const now = new Date();
  const id = item.id || `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const title = String(item.title || "").trim();
  const badge = String(item.badge || "Mise à jour").trim();
  const version = String(item.version || "").trim();
  const date = item.date
    ? String(item.date).trim()
    : now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const author = String(item.author || "Admin").trim();
  const featured = item.featured ? 1 : 0;
  const content = String(item.content || "").trim();
  const summary = String(item.summary || "").trim() || content.slice(0, 160).replace(/[#*`_]/g, "");
  const image = String(item.image || "").trim();
  const createdAt = item.createdAt || now.toISOString();
  const updatedAt = now.toISOString();

  if (db) {
    await ensureTable(env);

    // If featured, optionally unset other items' featured flag
    if (featured === 1) {
      try {
        await db.prepare("UPDATE news SET featured = 0 WHERE featured = 1").run();
      } catch (e) {
        console.warn("[DB] Erreur reset featured:", e.message);
      }
    }

    await db.prepare(`
      INSERT INTO news (id, title, badge, version, date, author, featured, summary, content, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title,
      badge,
      version,
      date,
      author,
      featured,
      summary,
      content,
      image,
      createdAt,
      updatedAt
    ).run();

    return normalizeNewsRow({
      id, title, badge, version, date, author, featured, summary, content, image, created_at: createdAt, updated_at: updatedAt
    });
  }

  // Fallback to R2 or memory
  const current = await getFallbackNews(env, origin);
  if (featured === 1) {
    current.forEach(n => { n.featured = false; });
  }

  const newItem = {
    id,
    title,
    badge,
    version,
    date,
    author,
    featured: Boolean(featured === 1),
    summary,
    content,
    image,
    createdAt,
    updatedAt,
  };

  const updatedList = [newItem, ...current];
  await saveFallbackNews(env, updatedList);
  return newItem;
}

/**
 * Update an existing news entry in the database
 */
export async function updateNews(env, id, item, origin = "") {
  if (!id) throw new Error("ID manquant pour la mise à jour");
  const db = getD1Binding(env);
  const now = new Date().toISOString();

  if (db) {
    await ensureTable(env);
    const existing = await getNewsById(env, id, origin);
    if (!existing) return null;

    const title = item.title !== undefined ? String(item.title).trim() : existing.title;
    const badge = item.badge !== undefined ? String(item.badge).trim() : existing.badge;
    const version = item.version !== undefined ? String(item.version).trim() : existing.version;
    const date = item.date !== undefined ? String(item.date).trim() : existing.date;
    const author = item.author !== undefined ? String(item.author).trim() : existing.author;
    const featured = item.featured !== undefined ? (item.featured ? 1 : 0) : (existing.featured ? 1 : 0);
    const content = item.content !== undefined ? String(item.content).trim() : existing.content;
    const summary = item.summary !== undefined ? String(item.summary).trim() : existing.summary;
    const image = item.image !== undefined ? String(item.image).trim() : existing.image;

    if (featured === 1) {
      try {
        await db.prepare("UPDATE news SET featured = 0 WHERE id != ?").bind(id).run();
      } catch (e) {
        console.warn("[DB] Erreur reset other featured:", e.message);
      }
    }

    await db.prepare(`
      UPDATE news
      SET title = ?, badge = ?, version = ?, date = ?, author = ?, featured = ?, summary = ?, content = ?, image = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      title,
      badge,
      version,
      date,
      author,
      featured,
      summary,
      content,
      image,
      now,
      id
    ).run();

    return normalizeNewsRow({
      id, title, badge, version, date, author, featured, summary, content, image, created_at: existing.createdAt, updated_at: now
    });
  }

  // Fallback
  const current = await getFallbackNews(env, origin);
  const idx = current.findIndex(n => n.id === id);
  if (idx === -1) return null;

  const existing = current[idx];
  const isFeatured = item.featured !== undefined ? Boolean(item.featured) : existing.featured;

  if (isFeatured) {
    current.forEach(n => { if (n.id !== id) n.featured = false; });
  }

  const updatedItem = {
    ...existing,
    title: item.title !== undefined ? String(item.title).trim() : existing.title,
    badge: item.badge !== undefined ? String(item.badge).trim() : existing.badge,
    version: item.version !== undefined ? String(item.version).trim() : existing.version,
    date: item.date !== undefined ? String(item.date).trim() : existing.date,
    author: item.author !== undefined ? String(item.author).trim() : existing.author,
    featured: isFeatured,
    summary: item.summary !== undefined ? String(item.summary).trim() : existing.summary,
    content: item.content !== undefined ? String(item.content).trim() : existing.content,
    image: item.image !== undefined ? String(item.image).trim() : existing.image,
    updatedAt: now,
  };

  current[idx] = updatedItem;
  await saveFallbackNews(env, current);
  return updatedItem;
}

/**
 * Delete a news entry from the database
 */
export async function deleteNews(env, id, origin = "") {
  if (!id) return false;
  const db = getD1Binding(env);

  if (db) {
    await ensureTable(env);
    const res = await db.prepare("DELETE FROM news WHERE id = ?").bind(id).run();
    return res && res.success !== false;
  }

  // Fallback
  const current = await getFallbackNews(env, origin);
  const idx = current.findIndex(n => n.id === id);
  if (idx === -1) return false;

  current.splice(idx, 1);
  await saveFallbackNews(env, current);
  return true;
}

/**
 * Seeds initial items into the database if empty
 */
export async function seedInitialNews(env, initialList = DEFAULT_NEWS_JSON) {
  const db = getD1Binding(env);
  if (!db || !Array.isArray(initialList) || initialList.length === 0) return false;

  await ensureTable(env);

  const statements = initialList.map(item => {
    const now = new Date().toISOString();
    return db.prepare(`
      INSERT OR IGNORE INTO news (id, title, badge, version, date, author, featured, summary, content, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id || `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      String(item.title || "Nouvelle annonce"),
      String(item.badge || "Mise à jour"),
      String(item.version || ""),
      String(item.date || new Date().toLocaleDateString("fr-FR")),
      String(item.author || "Admin"),
      item.featured ? 1 : 0,
      String(item.summary || ""),
      String(item.content || ""),
      String(item.image || ""),
      item.createdAt || now,
      item.updatedAt || now
    );
  });

  try {
    await db.batch(statements);
    return true;
  } catch (err) {
    console.warn("[DB] Erreur seedInitialNews batch:", err.message);
    return false;
  }
}

/**
 * Get database system status and statistics
 */
export async function getDbStatus(env, origin = "") {
  const db = getD1Binding(env);

  if (db) {
    try {
      await ensureTable(env);
      const countRes = await db.prepare("SELECT count(*) as total, sum(featured) as featuredCount FROM news").first();
      return {
        type: "D1_SQLITE",
        label: "Cloudflare D1 (Base relationnelle SQLite)",
        connected: true,
        total: countRes?.total || 0,
        featured: countRes?.featuredCount || 0,
      };
    } catch (e) {
      return {
        type: "D1_SQLITE_ERROR",
        label: "Cloudflare D1 (Erreur de connexion)",
        connected: false,
        error: e.message,
      };
    }
  }

  if (env && env.LAUNCHER_BUCKET) {
    const list = await getFallbackNews(env, origin);
    return {
      type: "R2_BUCKET",
      label: "Cloudflare R2 Bucket (news.json)",
      connected: true,
      total: list.length,
      featured: list.filter(n => n.featured).length,
    };
  }

  const list = await getFallbackNews(env, origin);
  return {
    type: "LOCAL_JSON",
    label: "Fichier Statique Local (news.json)",
    connected: true,
    total: list.length,
    featured: list.filter(n => n.featured).length,
  };
}
