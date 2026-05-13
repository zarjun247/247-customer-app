// Windows cmd.exe has an ~8K command-line limit; chunk files to stay under it
const CHUNK_SIZE = 30;

function chunk(arr) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    chunks.push(arr.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

export default {
  "**/*.{ts,tsx,js,mjs}": filenames => {
    const cmds = [];
    for (const c of chunk(filenames)) {
      const files = c.map(f => `"${f}"`).join(" ");
      cmds.push(`prettier --write ${files}`);
    }
    for (const c of chunk(filenames)) {
      const files = c.map(f => `"${f}"`).join(" ");
      cmds.push(`eslint --max-warnings=0 --no-warn-ignored ${files}`);
    }
    return cmds;
  },
};
