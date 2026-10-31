import { psql } from "./uat-health";

// ฐานทดสอบแยกที่ AI สร้างเองได้สำหรับ DOME Pos: uat_<ชื่อ> คัดลอกจาก domepos
export const TEST_DB_MARK = "uat-tester";
const MAX = 5;
const NAME = /^[a-z0-9_]{1,30}$/;
const W = { db: "postgres", write: true };

const rows = async (sql: string, db = "postgres") => (await psql(sql, { db })).split("\n").filter(Boolean);
const list = () => rows(`select datname from pg_database where shobj_description(oid, 'pg_database') = '${TEST_DB_MARK}' order by datname`);

export async function testDb(action: string, raw: string): Promise<string> {
  const have = await list();
  const show = (msg: string, dbs = have) => `${msg}\ntest DBs ${dbs.length}/${MAX}: ${dbs.join(", ") || "-"}`;
  if (action === "list") return show("ok");
  const name = raw.trim().toLowerCase().replace(/^uat_/, "");
  if (!NAME.test(name) || name.startsWith("template")) throw new Error("name: a-z 0-9 _ (1-30 chars), not 'template*'");
  const db = `uat_${name}`;
  if (action === "create") {
    if (have.includes(db)) return show(`${db} already exists`);
    if (have.length >= MAX) throw new Error(`limit ${MAX} test DBs — drop one first (${have.join(", ")})`);
    await psql(`CREATE DATABASE "${db}" TEMPLATE domepos STRATEGY FILE_COPY`, { ...W, timeout: 180_000 });
    await psql(`COMMENT ON DATABASE "${db}" IS '${TEST_DB_MARK}'`, W);
    return show(`created ${db} = copy of domepos`, [...have, db]);
  }
  if (action === "drop") {
    if (!have.includes(db)) throw new Error(`${db} was not created by test_db — refused`);
    await psql(`DROP DATABASE "${db}" WITH (FORCE)`, { ...W, timeout: 60_000 });
    return show(`dropped ${db}`, have.filter((d) => d !== db));
  }
  throw new Error("action: list | create | drop");
}
