import readline from "node:readline/promises";

import { isInteractive } from "./ai.js";

export async function promptYesNo(question: string, timeoutMs = 30_000): Promise<boolean> {
  if (!isInteractive()) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let timer: NodeJS.Timeout | undefined;

  try {
    const answer = await Promise.race([
      rl.question(`${question} `),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(""), timeoutMs);
      }),
    ]);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    rl.close();
  }
}
