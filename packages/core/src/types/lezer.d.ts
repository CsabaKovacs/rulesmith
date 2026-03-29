declare module "@lezer/lr" {
  export type TreeCursor = {
    name: string;
    from: number;
    to: number;
    firstChild(): boolean;
    nextSibling(): boolean;
    parent(): boolean;
  };

  export type Tree = {
    cursor(): TreeCursor;
  };

  export type LRParser = {
    parse(input: string): Tree;
  };
}

declare module "@lezer/python" {
  import type { LRParser } from "@lezer/lr";
  export const parser: LRParser;
}

declare module "@lezer/php" {
  import type { LRParser } from "@lezer/lr";
  export const parser: LRParser;
}

declare module "@lezer/java" {
  import type { LRParser } from "@lezer/lr";
  export const parser: LRParser;
}

declare module "@lezer/rust" {
  import type { LRParser } from "@lezer/lr";
  export const parser: LRParser;
}
