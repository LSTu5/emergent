import { schema, table, t } from "spacetimedb/server";
const record = table(
  { name: "record", public: true },
  { key: t.string().primaryKey(), kind: t.string().index(), body: t.string() },
);
const operator = table(
  { name: "operator" },
  { id: t.u32().primaryKey(), identity: t.identity() },
);
const db = schema({ record, operator });
export default db;
export const claim_operator = db.reducer((ctx) => {
  const o = ctx.db.operator.id.find(1);
  if (!o) ctx.db.operator.insert({ id: 1, identity: ctx.sender });
  else if (!o.identity.isEqual(ctx.sender))
    throw Error("Local operator already configured");
});
export const save_record = db.reducer(
  { key: t.string(), kind: t.string(), body: t.string() },
  (ctx, { key, kind, body }) => {
    const o = ctx.db.operator.id.find(1);
    if (!o || !o.identity.isEqual(ctx.sender)) throw Error("Operator required");
    JSON.parse(body);
    if (ctx.db.record.key.find(key))
      ctx.db.record.key.update({ key, kind, body });
    else ctx.db.record.insert({ key, kind, body });
  },
);
