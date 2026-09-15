/**
 * Generates a sample PDF for 13 Sep (+ 6 Sep progression) with charts
 * and asserts the PDF contains image streams and is large enough.
 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync, statSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCanvas } from 'canvas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(__dirname, 'out')
mkdirSync(outDir, { recursive: true })

const bundlePath = join(outDir, 'export-bundle.mjs')

await build({
  entryPoints: [join(root, 'src/lib/exportReport.ts')],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  outfile: bundlePath,
  external: ['jspdf', 'html2canvas'],
  logLevel: 'silent',
})

const { createPdfReport } = await import(pathToFileURL(bundlePath).href)

const settings = {
  churchName: 'Namasuba Redeemed',
  currencyLabel: 'UGX',
  noDebtMode: false,
  deductOperatingExpenses: true,
  modelBands: [
    {
      id: 'le40',
      label: '40k or less',
      minG: 0,
      maxG: 40.0000001,
      pastorFixed: null,
      instFixed: null,
      pastorPercent: 0.5,
      instPercent: 0.5,
      restDebt: 0,
      restUsher: 0,
      restSav: 0,
      noDebtMode: 'none',
      noDebtPastorShare: 0,
      noDebtInstShare: 0,
      dormantPercent: 0,
      requiresReview: false,
    },
    {
      id: 'gt40_lt70',
      label: 'Above 40k under 70k',
      minG: 40.0000001,
      maxG: 70,
      pastorFixed: 20,
      instFixed: 20,
      pastorPercent: null,
      instPercent: null,
      restDebt: 0.5,
      restUsher: 0.25,
      restSav: 0.25,
      noDebtMode: 'pastor_inst',
      noDebtPastorShare: 0.75,
      noDebtInstShare: 0.25,
      dormantPercent: 0,
      requiresReview: false,
    },
    {
      id: 'ge70_lt100',
      label: '70k to under 100k',
      minG: 70,
      maxG: 100,
      pastorFixed: 30,
      instFixed: 30,
      pastorPercent: null,
      instPercent: null,
      restDebt: 0.5,
      restUsher: 0.25,
      restSav: 0.25,
      noDebtMode: 'usher_sav',
      noDebtPastorShare: 0,
      noDebtInstShare: 0,
      dormantPercent: 0,
      requiresReview: false,
    },
    {
      id: 'ge100_lt200',
      label: '100k to under 200k',
      minG: 100,
      maxG: 200,
      pastorFixed: 50,
      instFixed: 30,
      pastorPercent: null,
      instPercent: null,
      restDebt: 0.5,
      restUsher: 0.25,
      restSav: 0.25,
      noDebtMode: 'usher_sav',
      noDebtPastorShare: 0,
      noDebtInstShare: 0,
      dormantPercent: 0,
      requiresReview: false,
    },
    {
      id: 'ge200_lt300',
      label: '200k to under 300k',
      minG: 200,
      maxG: 300,
      pastorFixed: 70,
      instFixed: 30,
      pastorPercent: null,
      instPercent: null,
      restDebt: 0.5,
      restUsher: 0.25,
      restSav: 0.25,
      noDebtMode: 'usher_sav',
      noDebtPastorShare: 0,
      noDebtInstShare: 0,
      dormantPercent: 0.15,
      requiresReview: false,
    },
    {
      id: 'ge300',
      label: 'Above 300k',
      minG: 300,
      maxG: null,
      pastorFixed: null,
      instFixed: null,
      pastorPercent: null,
      instPercent: null,
      restDebt: 0,
      restUsher: 0,
      restSav: 0,
      noDebtMode: 'none',
      noDebtPastorShare: 0,
      noDebtInstShare: 0,
      dormantPercent: 0,
      requiresReview: true,
    },
  ],
  dormantMinistries: ['Media/WiFi', 'Facilities', 'Communication', 'Benevolence'],
  operatingSubcategories: ['Drinking water'],
  categories: [],
  trialStart: '2025-09-01',
  trialEnd: '2025-12-31',
  trialReviewDate: '2025-12-15',
  adminPassword: '',
  role: 'Admin',
}

const sep6 = {
  id: 'sample-6',
  date: '2025-09-06',
  incomes: [
    {
      id: 'i1',
      type: 'general_offertory',
      label: 'General offertory',
      amount: 80,
    },
  ],
  expenses: [
    {
      id: 'e1',
      category: 'Pastor',
      subcategory: 'Weekly support',
      description: 'Pastor support',
      amount: 40,
    },
    {
      id: 'e2',
      category: 'Instrumentalists',
      subcategory: 'Music team',
      description: 'Instrumentalists',
      amount: 30,
    },
    {
      id: 'e3',
      category: 'Other ministries and operations',
      subcategory: 'Drinking water',
      description: 'Sunday drinking water',
      amount: 10,
    },
  ],
  notes: 'Sample Sunday for discussion - 6 Sep 2025',
  enteredBy: 'Sample preload',
  createdAt: '2025-09-06T12:00:00.000Z',
  updatedAt: '2025-09-06T12:00:00.000Z',
  status: 'Ready',
}

const sep13 = {
  id: 'sample-13',
  date: '2025-09-13',
  incomes: [
    {
      id: 'i1',
      type: 'general_offertory',
      label: 'General offertory',
      amount: 72,
    },
  ],
  expenses: [
    {
      id: 'e1',
      category: 'Pastor',
      subcategory: 'Weekly support',
      description: 'Pastor support',
      amount: 34,
    },
    {
      id: 'e2',
      category: 'Instrumentalists',
      subcategory: 'Music team',
      description: 'Instrumentalists',
      amount: 30,
    },
    {
      id: 'e3',
      category: 'Other ministries and operations',
      subcategory: 'Drinking water',
      description: 'Sunday drinking water',
      amount: 8,
    },
  ],
  notes: 'Sample Sunday for discussion - 13 Sep 2025',
  enteredBy: 'Sample preload',
  createdAt: '2025-09-13T12:00:00.000Z',
  updatedAt: '2025-09-13T12:00:00.000Z',
  status: 'Ready',
}

const { doc, filename } = createPdfReport([sep6, sep13], settings, {
  contentMode: 'actual_proposed',
  includeProgression: true,
  includeCharts: true,
  canvasFactory: () => createCanvas(700, 280),
})

const outPath = join(outDir, 'sample-13sep-with-charts.pdf')
const buf = Buffer.from(doc.output('arraybuffer'))
writeFileSync(outPath, buf)

const size = statSync(outPath).size
const asText = readFileSync(outPath).toString('latin1')
const hasXObject = asText.includes('/XObject')
const hasImage = /\/Subtype\s*\/Image/.test(asText) || asText.includes('/Image')
const hasChartTitle =
  asText.includes('Actual vs proposed') ||
  asText.includes('Progression across Sundays')
const hasBand = asText.includes('70k to under 100k')
const noGarble = !asText.includes('"d G') && !asText.includes('d G <')

console.log('PDF written:', outPath)
console.log('Suggested name:', filename)
console.log('Size bytes:', size)
console.log('Has /XObject:', hasXObject)
console.log('Has /Image:', hasImage)
console.log('Has chart titles:', hasChartTitle)
console.log('Has ASCII band label:', hasBand)
console.log('No band garble:', noGarble)

const okImage = hasXObject || hasImage
const okSize = size > 30_000

if (!okImage && !okSize) {
  console.error('FAIL: PDF missing image streams and size <= 30KB')
  process.exit(1)
}
if (!okImage) {
  console.error('FAIL: expected embedded chart images (/XObject or /Image)')
  process.exit(1)
}
if (!okSize) {
  console.error('FAIL: PDF size should be > 30KB, got', size)
  process.exit(1)
}
if (!hasChartTitle) {
  console.error('FAIL: chart section titles missing')
  process.exit(1)
}
if (!noGarble) {
  console.error('FAIL: band label still garbled')
  process.exit(1)
}

console.log('VERIFY OK')
console.log('SAMPLE_PDF_PATH=' + outPath)
console.log('SAMPLE_PDF_SIZE=' + size)
