// Turns dist/index.html into dist/artifact.html: the same page without the
// <html>/<head>/<body> wrapper, which the artifact host adds on its own.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keepHead = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
const scripts = [];
const headNoScripts = keepHead.replace(/<script[\s\S]*?<\/script>/g, (s) => {
  scripts.push(s);
  return '';
});
writeFileSync('dist/artifact.html', `${headNoScripts.trim()}\n${body.trim()}\n${scripts.join('\n')}\n`);
console.log('dist/artifact.html written');
