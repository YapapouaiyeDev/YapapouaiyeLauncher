import assert from "node:assert";
import {
  ensureTable,
  getAllNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews,
  seedInitialNews,
  getDbStatus
} from "./functions/_lib/db.js";

/**
 * In-memory Mock implementation of Cloudflare D1 Database
 */
class MockD1Database {
  constructor() {
    this.tables = { news: new Map() };
  }

  async exec(sql) {
    // Basic table creation mock
    if (sql.includes("CREATE TABLE IF NOT EXISTS news")) {
      if (!this.tables.news) this.tables.news = new Map();
    }
    return { success: true };
  }

  prepare(sql) {
    const self = this;
    let boundArgs = [];

    return {
      bind(...args) {
        boundArgs = args;
        return this;
      },
      async all() {
        if (sql.includes("SELECT") && sql.includes("FROM news")) {
          let rows = Array.from(self.tables.news.values());
          if (sql.includes("ORDER BY featured DESC, created_at DESC")) {
            rows.sort((a, b) => {
              if (b.featured !== a.featured) return b.featured - a.featured;
              return (b.created_at || "").localeCompare(a.created_at || "");
            });
          }
          return { results: rows, success: true };
        }
        return { results: [], success: true };
      },
      async first() {
        if (sql.includes("SELECT * FROM news WHERE id = ?")) {
          const id = boundArgs[0];
          return self.tables.news.get(id) || null;
        }
        if (sql.includes("count(*)")) {
          const rows = Array.from(self.tables.news.values());
          const total = rows.length;
          const featuredCount = rows.filter(r => r.featured == 1).length;
          return { total, featuredCount };
        }
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO news") || sql.includes("INSERT OR IGNORE INTO news")) {
          const [id, title, badge, version, date, author, featured, summary, content, image, created_at, updated_at] = boundArgs;
          self.tables.news.set(id, {
            id, title, badge, version, date, author, featured, summary, content, image, created_at, updated_at
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes("UPDATE news SET")) {
          if (sql.includes("WHERE id = ?")) {
            const [title, badge, version, date, author, featured, summary, content, image, updated_at, id] = boundArgs;
            const existing = self.tables.news.get(id);
            if (existing) {
              const updated = {
                ...existing,
                title, badge, version, date, author, featured, summary, content, image, updated_at
              };
              self.tables.news.set(id, updated);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: false, meta: { changes: 0 } };
          }
          if (sql.includes("featured = 0")) {
            for (const [k, v] of self.tables.news.entries()) {
              self.tables.news.set(k, { ...v, featured: 0 });
            }
            return { success: true };
          }
        }
        if (sql.includes("DELETE FROM news WHERE id = ?")) {
          const id = boundArgs[0];
          const existed = self.tables.news.has(id);
          self.tables.news.delete(id);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }
        return { success: true };
      }
    };
  }

  async batch(statements) {
    for (const stmt of statements) {
      await stmt.run();
    }
    return { success: true };
  }
}

async function runDatabaseTests() {
  console.log("▶ Test 1: Initialisation et création de la table D1...");
  const mockDb = new MockD1Database();
  const env = { DB: mockDb };

  const ensured = await ensureTable(env);
  assert.strictEqual(ensured, true, "La table doit être initialisée");
  console.log("✔ Test 1 réussi !");

  console.log("▶ Test 2: Insertion (createNews) dans la base de données...");
  const created = await createNews(env, {
    title: "Mise à jour 1.5.6 Test",
    badge: "Mise à jour",
    version: "v1.5.6",
    author: "AdminTest",
    content: "Contenu de test en **Markdown**.",
    featured: true,
  });

  assert(created && created.id, "L'annonce créée doit avoir un ID");
  assert.strictEqual(created.title, "Mise à jour 1.5.6 Test");
  assert.strictEqual(created.featured, true, "L'annonce doit être en une");
  console.log("✔ Test 2 réussi !");

  console.log("▶ Test 3: Lecture (getAllNews / getNewsById)...");
  const all = await getAllNews(env);
  assert(all.length >= 1, "La liste doit contenir au moins 1 article");
  const byId = await getNewsById(env, created.id);
  assert(byId, "La recherche par ID doit retourner l'article");
  assert.strictEqual(byId.id, created.id);
  console.log("✔ Test 3 réussi !");

  console.log("▶ Test 4: Modification (updateNews)...");
  const updated = await updateNews(env, created.id, {
    title: "Titre Modifié via BD",
    badge: "Important",
    summary: "Nouveau résumé modifié",
  });
  assert(updated, "L'article doit être mis à jour");
  assert.strictEqual(updated.title, "Titre Modifié via BD");
  assert.strictEqual(updated.badge, "Important");
  assert.strictEqual(updated.summary, "Nouveau résumé modifié");
  console.log("✔ Test 4 réussi !");

  console.log("▶ Test 5: Statut de la base de données (getDbStatus)...");
  const status = await getDbStatus(env);
  assert.strictEqual(status.type, "D1_SQLITE");
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.total, 1);
  console.log("✔ Test 5 réussi !");

  console.log("▶ Test 6: Suppression (deleteNews)...");
  const deleted = await deleteNews(env, created.id);
  assert.strictEqual(deleted, true, "La suppression doit réussir");
  const remaining = await getAllNews(env);
  assert.strictEqual(remaining.length, 0, "La liste doit être vide après suppression");
  console.log("✔ Test 6 réussi !");

  console.log("▶ Test 7: Remplissage initial en lot (seedInitialNews)...");
  const seeded = await seedInitialNews(env);
  assert.strictEqual(seeded, true, "Le seed doit réussir");
  const seededList = await getAllNews(env);
  assert(seededList.length >= 3, "Le seed doit ajouter les articles par défaut");
  console.log("✔ Test 7 réussi !");

  console.log("\n🎉 Tous les tests unitaires de la base de données sont passés avec succès !");
}

runDatabaseTests().catch(err => {
  console.error("❌ Échec des tests de base de données :", err);
  process.exit(1);
});
