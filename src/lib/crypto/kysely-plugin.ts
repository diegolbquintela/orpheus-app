/**
 * #93: a Kysely plugin that keeps Better Auth's sensitive columns encrypted (design sections 3 and 8). Server-only.
 *
 * - INSERT / UPDATE: values for a sealed column (scripts/data-crypto.mjs SEALED_COLUMNS) are sealed with the current key.
 * - WHERE `=` / `<>` / `in` / `not in` on a deterministic column: the value becomes every stored form it may have
 *   (`in (candidates)`: each configured key + legacy plaintext), so lookups survive rotation and the migration.
 * - Any other filter on a sealed column (randomized ones, LIKE, ranges) is refused with an error (fail closed).
 * - Result rows: sealed values are opened (decrypted) for the query's table.
 *
 * The keyring is read per query (`getKeyring`), so a missing key fails each query instead of writing plaintext.
 */
import {
  type Dialect,
  Kysely,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
} from "kysely";
import { SEALED_COLUMNS, columnSpec, lookupCandidates, openValue, sealValue, type Keyring } from "../../../scripts/data-crypto.mjs";

type Node = { kind: string; [k: string]: unknown };

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && typeof (v as Node).kind === "string";

/** `name` of an IdentifierNode-bearing node (TableNode, ColumnNode, ReferenceNode). */
function tableName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.kind === "AliasNode") return tableName(node.node);
  // Better Auth wraps lookups as `select "primary".* from (select * from "session" where …) as "primary"`.
  if (node.kind === "SelectQueryNode") return rootTable(node);
  if (node.kind === "TableNode") {
    const t = node.table as Node;
    return ((t.identifier as Node)?.name as string) ?? null;
  }
  return null;
}

function columnName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.kind === "ReferenceNode") return columnName(node.column);
  if (node.kind === "ColumnNode") return ((node.column as Node)?.name as string) ?? null;
  return null;
}

function rootTable(node: Node): string | null {
  switch (node.kind) {
    case "SelectQueryNode": {
      const froms = (node.from as Node | undefined)?.froms as unknown[] | undefined;
      return froms && froms.length === 1 ? tableName(froms[0]) : null;
    }
    case "InsertQueryNode":
      return tableName(node.into);
    case "UpdateQueryNode":
      return tableName(node.table);
    case "DeleteQueryNode": {
      const froms = (node.from as Node | undefined)?.froms as unknown[] | undefined;
      return froms && froms.length === 1 ? tableName(froms[0]) : null;
    }
    default:
      return null;
  }
}

const valueNode = (value: unknown): Node => Object.freeze({ kind: "ValueNode", value }) as Node;

export class SealedColumnsPlugin implements KyselyPlugin {
  readonly #getKeyring: () => Keyring;
  readonly #tables = new WeakMap<object, string>();

  constructor(getKeyring: () => Keyring) {
    this.#getKeyring = getKeyring;
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const node = args.node as unknown as Node;
    const table = rootTable(node);
    if (!table || !SEALED_TABLE(table)) return args.node;
    this.#tables.set(args.queryId, table);
    const ring = this.#getKeyring();
    return this.#walk(node, table, ring) as unknown as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const table = this.#tables.get(args.queryId);
    if (!table || !args.result.rows?.length) return args.result;
    const ring = this.#getKeyring();
    const rows = args.result.rows.map((row) => {
      const out: UnknownRow = { ...row };
      for (const [k, v] of Object.entries(row)) if (columnSpec(table, k)) out[k] = openValue(ring, table, k, v);
      return out;
    });
    return { ...args.result, rows };
  }

  #walk(node: unknown, table: string, ring: Keyring): unknown {
    if (Array.isArray(node)) return Object.freeze(node.map((n) => this.#walk(n, table, ring)));
    if (!isNode(node)) return node;
    switch (node.kind) {
      case "InsertQueryNode":
        return this.#insert(node, table, ring);
      case "ColumnUpdateNode": {
        const col = columnName(node.column);
        if (col && columnSpec(table, col) && isNode(node.value) && node.value.kind === "ValueNode")
          return Object.freeze({ ...node, value: valueNode(sealValue(ring, table, col, node.value.value)) });
        return node;
      }
      case "BinaryOperationNode":
        return this.#filter(node, table, ring);
      default: {
        const out: Record<string, unknown> = {};
        let changed = false;
        for (const [k, v] of Object.entries(node)) {
          const w = typeof v === "object" && v !== null ? this.#walk(v, table, ring) : v;
          if (w !== v) changed = true;
          out[k] = w;
        }
        return changed ? Object.freeze(out) : node;
      }
    }
  }

  #insert(node: Node, table: string, ring: Keyring): Node {
    const cols = ((node.columns as unknown[]) ?? []).map(columnName);
    const values = node.values as Node | undefined;
    if (!values || values.kind !== "ValuesNode" || !cols.some((c) => c && columnSpec(table, c))) return node;
    const rows = (values.values as Node[]).map((row) => {
      if (row.kind === "PrimitiveValueListNode") {
        const vals = (row.values as unknown[]).map((v, i) => (cols[i] ? sealValue(ring, table, cols[i]!, v) : v));
        return Object.freeze({ ...row, values: Object.freeze(vals) });
      }
      if (row.kind === "ValueListNode") {
        const vals = (row.values as Node[]).map((v, i) => {
          const c = cols[i];
          if (!c || !columnSpec(table, c)) return v;
          if (v.kind !== "ValueNode") throw new Error(`${table}.${c}: only plain values can be sealed`);
          return valueNode(sealValue(ring, table, c, v.value));
        });
        return Object.freeze({ ...row, values: Object.freeze(vals) });
      }
      return row;
    });
    return Object.freeze({ ...node, values: Object.freeze({ ...values, values: Object.freeze(rows) }) }) as Node;
  }

  #filter(node: Node, table: string, ring: Keyring): Node {
    const col = columnName(node.leftOperand);
    const spec = col ? columnSpec(table, col) : undefined;
    if (!col || !spec) {
      const left = this.#walk(node.leftOperand, table, ring);
      const right = this.#walk(node.rightOperand, table, ring);
      return left === node.leftOperand && right === node.rightOperand
        ? node
        : (Object.freeze({ ...node, leftOperand: left, rightOperand: right }) as Node);
    }
    const op = String((node.operator as Node)?.operator ?? "");
    const right = node.rightOperand as Node;
    if ((op === "is" || op === "is not") && right?.kind === "ValueNode" && right.value === null) return node;
    if (!spec.det) throw new Error(`refused: filter on encrypted column ${table}.${col}`);
    let plains: unknown[];
    if ((op === "=" || op === "<>") && right?.kind === "ValueNode") plains = [right.value];
    else if ((op === "in" || op === "not in") && right?.kind === "PrimitiveValueListNode") plains = right.values as unknown[];
    else if ((op === "in" || op === "not in") && right?.kind === "ValueListNode")
      plains = (right.values as Node[]).map((v) => {
        if (v.kind !== "ValueNode") throw new Error(`refused: filter on encrypted column ${table}.${col}`);
        return v.value;
      });
    else throw new Error(`refused: ${op} on encrypted column ${table}.${col}`);
    const candidates = plains.flatMap((p) =>
      typeof p === "string" ? lookupCandidates(ring, table, col, p) : [p],
    );
    const negate = op === "<>" || op === "not in";
    return Object.freeze({
      ...node,
      operator: Object.freeze({ kind: "OperatorNode", operator: negate ? "not in" : "in" }),
      rightOperand: Object.freeze({ kind: "PrimitiveValueListNode", values: Object.freeze(candidates) }),
    }) as Node;
  }
}

const SEALED_TABLE = (table: string): boolean => Object.hasOwn(SEALED_COLUMNS, table);

/** Better Auth's `database` option: Kysely over `dialect` with the plugin. */
export function sealedAuthDatabase(dialect: Dialect, getKeyring: () => Keyring) {
  return { db: new Kysely({ dialect, plugins: [new SealedColumnsPlugin(getKeyring)] }), type: "postgres" as const };
}
