import fs from "node:fs";
import yaml from "js-yaml";

export function loadYamlFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content) as T;
}
