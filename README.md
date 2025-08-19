# SEO Checker for Nuxt Projects v2.2.0

A comprehensive, zero-dependency SEO checker for Nuxt projects that validates SEO implementation with dynamic evaluation, meta content monitoring, and structured data schemas with detailed reporting.

## Features

- ✅ Dynamic `generateSEO()` evaluation for accurate meta tag detection
- 📝 Meta content monitoring with visual validation indicators
- 🖼️ Image parameter tracking and duplicate detection
- 📊 Category-based scoring system (100 points total)
- 📍 Validates sitemap coverage
- 🤖 Verifies robots configuration (@nuxtjs/robots or robots.txt)
- 📊 Detects Schema.org structured data implementation with item counts
- 📈 Provides detailed schema summary and statistics
- 🎨 Color-coded terminal output for easy reading
- 💡 Smart recommendations based on analysis
- 🚀 Works with any Nuxt project structure
- 0️⃣ Zero external dependencies

## Installation

### Option 1: Run without installing (Recommended)
```bash
npx github:evoaiman/seo-checker
```

### Option 2: Install as dev dependency
```bash
npm install -D github:evoaiman/seo-checker
```

### Option 3: Install globally
```bash
npm install -g github:evoaiman/seo-checker
```

## Usage

### Basic Usage

Run the checker from your Nuxt project root directory:

```bash
# If installed globally or locally
seo-check

# Or use npx (no installation needed)
npx github:evoaiman/seo-checker
```

### Add to package.json

For regular use, add it to your project scripts:

```json
{
  "scripts": {
    "seo": "seo-check",
    "seo:check": "seo-check"
  }
}
```

Then run:
```bash
npm run seo
```

### What It Checks

The tool analyzes your Nuxt project for:

1. **SEO Implementation**: Dynamically evaluates `generateSEO()` or validates `useSeoMeta()` functions
2. **Meta Tags**: Validates title (50-60 chars) and description (120-160 chars) with visual indicators
3. **Open Graph & Twitter Cards**: Verifies social media meta tags from actual output
4. **Image Tracking**: Monitors image parameters and detects duplicates across pages
5. **Structured Data**: Detects and counts Schema.org implementations
6. **Sitemap Coverage**: Verifies which pages are included in your sitemap
7. **Robots Configuration**: Checks for robots.txt or @nuxtjs/robots module
8. **Category Scoring**: Provides breakdown across 5 SEO categories (100 points total)

## GitHub Actions Integration

Create `.github/workflows/seo.yml`:

```yaml
name: SEO Check

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  seo-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npx github:evoaiman/seo-checker
```

## Understanding the Output

The checker provides a comprehensive report with multiple sections:

### Example Output (v2.2.0)

```
🔍 Starting SEO check...
Project: astra

=========================================
SEO Check Report - astra
=========================================

📊 Overall Score: 92/100 (92%)

Category Breakdown:
✅ Meta Tags           20/20 (100%)
✅ Technical SEO        18/20 (90%)
✅ Structured Data     20/20 (100%)
✅ Images & Media      16/20 (80%)
✅ Social Sharing      18/20 (90%)

✅ Pages with SEO (7/7)
  ✓ about.vue
    📋 Schemas: WebPage, Organization
    📷 Image: about.png
    ✅ Title: About Us - Astra Battery Factory (38 chars)
    ✅ Description: Astra Simfoni about page provides... (218 chars)
  
  ✓ contact.vue
    📋 Schemas: ContactPage, Organization, WebPage
    📷 Image: contact.png
    ✅ Title: Contact Us - Astra Battery Factory (40 chars)
    ⚠️  Description: Contact Astra Manufacturing for... (233 chars)
  
  ✓ index.vue
    📋 Schemas: Product (5), LocalBusiness (11), WebPage
    📷 Image: homepage.png ⚠️ Duplicate image used by index-en.vue
  
  ✓ products.vue
    📋 Schemas: Product (12), WebPage, Organization
    📷 Image: products.png
    ✅ Title: Product Catalogue - Astra Battery Factory (52 chars)
    ✅ Description: Browse our complete range of batteries... (145 chars)

📊 Meta Content Overview:
┌─────────────┬──────────────────────────────────┬────────┬──────────┐
│ Page        │ Title                            │ Length │ Status   │
├─────────────┼──────────────────────────────────┼────────┼──────────┤
│ about       │ About Us - Astra Battery Factory │ 38     │ ⚠️ Short │
│ contact     │ Contact Us - Astra Battery...    │ 40     │ ⚠️ Short │
│ index       │ Astra Battery Factory            │ 22     │ ❌ Short │
│ products    │ Product Catalogue - Astra...     │ 52     │ ✅ Good  │
└─────────────┴──────────────────────────────────┴────────┴──────────┘

⚠️ Duplicate Images Detected:
  • homepage.png used by: index.vue, index-en.vue

📊 Schema Summary
  Total schema instances: 23 across 7 schema types
  • WebPage: 7 pages (100%)
  • Organization: 7 pages (100%)
  • Product: 3 pages (43%)
  • LocalBusiness: 2 pages (29%)
  • ContactPage: 1 page (14%)

📍 Sitemap Coverage (7/7 pages - 100%)
  ✓ All pages included in sitemap

🤖 Robots Configuration
  ✓ Robots configuration found in nuxt.config

Quick Fixes (High Impact):
  1. Increase title length for 3 pages (+3 points)
  2. Optimize description length for 1 page (+1 point)
  3. Use unique images for each page (+4 points)

Final Assessment: 92% - Excellent
=========================================
```

### Output Sections Explained (v2.2.0)

#### 1. **Overall Score & Categories** 📊
Category-based scoring system (100 points total):
- **Meta Tags** (20 pts): Title/description presence and optimal length
- **Technical SEO** (20 pts): Sitemap, robots, canonical URLs
- **Structured Data** (20 pts): Schema.org implementation
- **Images & Media** (20 pts): Alt text, unique images
- **Social Sharing** (20 pts): Open Graph and Twitter Card tags

#### 2. **Pages with SEO** ✅
Enhanced page analysis showing:
- **Page name**: The Vue file name
- **Schemas**: Lists all detected Schema.org structured data types
- **Image**: Tracked image parameter with duplicate warnings
- **Title**: Full title with character count and validation indicator
- **Description**: Description preview with length validation

#### 3. **Meta Content Overview** 📊
Tabular view of all meta content:
- **Page**: Page identifier
- **Title**: Truncated title display
- **Length**: Character count
- **Status**: Visual indicator (✅ Good, ⚠️ Warning, ❌ Error)

#### 4. **Duplicate Images** ⚠️
Lists images used across multiple pages:
- Shows which image files are reused
- Lists all pages using each duplicate image

#### 5. **Schema Summary** 📊
Provides statistics about structured data usage:
- **Total instances**: Total number of schema implementations
- **Schema types**: Each type with usage count and percentage
- **Page coverage**: Shows adoption across pages

#### 6. **Sitemap Coverage** 📍
Analyzes your sitemap configuration:
- **Coverage percentage**: How much of your site is in the sitemap
- **Listed/Missing**: Breakdown of included vs excluded pages

#### 7. **Quick Fixes** 💡
Prioritized improvements with point impact:
- Lists high-impact fixes first
- Shows potential score improvement for each fix
- Focuses on easily actionable items

#### 8. **Final Assessment**
Overall rating based on score:
- **90-100%**: Excellent! 🎉
- **70-89%**: Good 👍
- **50-69%**: Needs Improvement ⚠️
- **Below 50%**: Poor (will fail in CI) ❌

## Supported Project Structures

The checker automatically detects common Nuxt project structures:

- **Pages**: `app/pages/`, `pages/`, `src/pages/`
- **Sitemap**: `server/api/sitemap/static.ts`, `server/api/sitemap.ts`
- **Config**: `nuxt.config.ts`, `nuxt.config.js`
- **SEO Utils**: `app/utils/seo.js`, `utils/seo.js`

## Configuration

The checker works out of the box with sensible defaults:

### Ignored Paths
Certain paths are automatically excluded from SEO checks:

```javascript
// Default ignored paths
ignorePaths: ['purchase/order', 'purchase/orderLead', 'purchase', 'admin', 'api']
```

These typically include:
- Admin panels
- API routes
- Internal purchase/order pages
- Authentication pages

### Schema Detection
The tool automatically detects various Schema.org implementations:
- **WebPage**: Base schema for all pages
- **Organization**: Company/organization information
- **Product**: Product listings with details
- **FAQPage**: Frequently asked questions
- **ContactPage**: Contact information pages
- **LocalBusiness**: Branch/location information
- **BreadcrumbList**: Navigation breadcrumbs
- **NewsArticle**: News/blog articles
- **Service**: Service offerings
- **Grant**: Sponsorship/grant programs

## Exit Codes

- `0`: Success (SEO score >= 50% or not in CI environment)
- `1`: Failure (SEO score < 50% in CI environment)

## Best Practices

To achieve a high SEO score:

1. **Implement SEO on all public pages**: Use `generateSEO()` or `useSeoMeta()` with `useHead()`
2. **Add structured data**: Include relevant Schema.org types for better search results
3. **Maintain sitemap**: Keep your sitemap updated with all public pages
4. **Use multiple schemas**: Aim for 3+ schemas per page when relevant
5. **Configure robots properly**: Use @nuxtjs/robots or maintain robots.txt

## Requirements

- Node.js >= 18.0.0
- Nuxt project (Nuxt 3 recommended)

## License

MIT

## Author

evoaiman

## Contributing

Issues and PRs welcome at [github.com/evoaiman/seo-checker](https://github.com/evoaiman/seo-checker)

## Changelog

### v2.2.0
- Added meta content monitoring with visual validation indicators
- Image parameter tracking from generateSEO
- Duplicate image detection across pages
- Enhanced meta content overview table with truncation
- Improved title/description length validation

### v2.1.0
- Fixed breadcrumb list false detection issue
- Enhanced display formatting for better readability

### v2.0.0
- Dynamic generateSEO evaluation for accurate detection
- Category-based scoring system (100 points total)
- Fixed false negatives for Open Graph and Twitter tags
- Added visual indicators for meta content validation
- Improved schema detection accuracy

### v1.1.0
- Enhanced schema detection with item counts
- Added comprehensive schema summary section
- Improved parameter extraction from generateSEO()
- Better visualization with colors and icons
- Smart recommendations based on coverage analysis
- Detailed reporting for structured data

### v1.0.0
- Initial release
- Basic SEO checking functionality
- Sitemap validation
- Robots configuration detection