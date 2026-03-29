declare module "bash-parser" {
  export default function parse(input: string): unknown;
}

declare module "node-sql-parser" {
  export class Parser {
    astify(sql: string, options?: Record<string, unknown>): unknown;
  }
}
