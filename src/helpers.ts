import * as parse from "url-parse"
export function pathMatch(url: string, path: string) {
  try {
    return parse(url).pathname === path;
  } catch (e) {
    return false;
  }
};
