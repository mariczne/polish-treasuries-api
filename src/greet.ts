import { Effect } from "effect";

export function greet(name: string) {
  return Effect.succeed(`Hello, ${name}!`);
}
