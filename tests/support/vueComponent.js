import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const compiled = new Map()
async function componentModule(url) {
  if (compiled.has(url.href)) return compiled.get(url.href)
  const { descriptor } = parse(readFileSync(url, 'utf8'))
  let code = descriptor.script || descriptor.scriptSetup
    ? compileScript(descriptor, { id: url.pathname, inlineTemplate: true }).content
    : compileTemplate({ source: descriptor.template.content, filename: url.pathname, id: url.pathname }).code
      .replace('export function render', 'function render') + '\nexport default { render }'
  code = code.replace(/from ['"](vue|vue-router)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`)
  code = code.replace(/from ['"](\.[^'"]+\.js)['"]/g, (_, relative) => `from '${new URL(relative, url).href}'`)
  code = code.replace(/import (\w+) from ['"][^'"]+\.svg['"]/g, (_, name) => `const ${name} = '/fixture-logo.svg'`)
  for (const match of [...code.matchAll(/import (\w+) from ['"](\.[^'"]+\.vue)['"]/g)]) {
    code = code.replace(match[0], `import ${match[1]} from '${await componentModule(new URL(match[2], url))}'`)
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiled.set(url.href, result)
  return result
}

export async function loadVueComponent(url) {
  return (await import(await componentModule(url))).default
}
