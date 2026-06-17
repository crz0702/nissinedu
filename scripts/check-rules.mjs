import fs from 'fs';
import vm from 'vm';

const templatesSource = fs.readFileSync(new URL('../templates.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(`${templatesSource}\n;globalThis.__exports = { Q, KENKYU_Q, ANSWER_GUIDES };`, context);

const { Q, KENKYU_Q, ANSWER_GUIDES } = context.__exports;
const ids = [...Object.keys(Q), ...Object.keys(KENKYU_Q)];
const missingRules = ids.filter((id) => !new RegExp(`${id}\\s*:`).test(appSource));
const missingGuides = ids.filter((id) => !ANSWER_GUIDES[id]);
const requiredFragments = [
  'UX_ENHANCEMENTS_START',
  'DRAFT_KEY_PREFIX',
  'answerQuality',
  'fact-check',
  'limit-presets'
];
const missingFragments = requiredFragments.filter((fragment) => !appSource.includes(fragment));

if (missingRules.length || missingGuides.length || missingFragments.length) {
  if (missingRules.length) console.error('Missing INPUT_RULES entries:', missingRules.join(', '));
  if (missingGuides.length) console.error('Missing ANSWER_GUIDES entries:', missingGuides.join(', '));
  if (missingFragments.length) console.error('Missing UX fragments:', missingFragments.join(', '));
  process.exit(1);
}

console.log(`OK: ${ids.length} question ids have validation rules and writing guides.`);
